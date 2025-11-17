#!/usr/bin/env node

/**
 * Test script for DES and Monte Carlo simulation engines
 * 
 * Usage:
 *   node test-sim.js <scenario-file> [options]
 * 
 * Options:
 *   --iterations <N>     Number of Monte Carlo iterations (default: 100)
 *   --monte-only         Only run Monte Carlo (skip DES)
 *   --des-only           Only run DES (skip Monte Carlo)
 *   --verbose            Show detailed output
 * 
 * Example:
 *   node test-sim.js sim/des/scenarios/baseline.json
 *   node test-sim.js sim/des/scenarios/smoke-1unit-1type-hourly-short-flight.json --iterations 50
 *   pnpm run test-sim sim/des/scenarios/smoke-1unit-1type-hourly-short-flight.json --iterations 50
 */

const fs = require('fs');
const path = require('path');
const { runSimulation } = require('./sim/des/engine');
const { runMonteCarlo } = require('./sim/monte/engine');

// Parse command line arguments
const args = process.argv.slice(2);
const scenarioFile = args.find(arg => !arg.startsWith('--'));
const iterations = parseInt(args.find(arg => arg.startsWith('--iterations'))?.split('=')[1] || '100', 10);
const monteOnly = args.includes('--monte-only');
const desOnly = args.includes('--des-only');
const verbose = args.includes('--verbose');

if (!scenarioFile) {
  console.error('Error: Scenario file path required');
  console.error('\nUsage: node test-sim.js <scenario-file> [options]');
  console.error('\nOptions:');
  console.error('  --iterations <N>     Number of Monte Carlo iterations (default: 100)');
  console.error('  --monte-only         Only run Monte Carlo (skip DES)');
  console.error('  --des-only           Only run DES (skip Monte Carlo)');
  console.error('  --verbose            Show detailed output');
  process.exit(1);
}

// Resolve scenario file path
const scenarioPath = path.isAbsolute(scenarioFile) 
  ? scenarioFile 
  : path.join(__dirname, scenarioFile);

if (!fs.existsSync(scenarioPath)) {
  console.error(`Error: Scenario file not found: ${scenarioPath}`);
  process.exit(1);
}

/**
 * Create a mock state object for testing
 * This simulates the database view structure that the DES engine expects
 */
function createMockState(scenario) {
  // Extract units from scenario if available
  const units = scenario.unit_policy?.mission_split 
    ? Object.keys(scenario.unit_policy.mission_split)
    : ['VMU-1', 'VMU-3'];
  
  // Create mock state with reasonable defaults
  const state = {
    tables: {
      v_unit: {
        rows: units.map(unit => ({ Unit: unit }))
      },
      v_aircraft: {
        rows: units.flatMap(unit => 
          Array.from({ length: 5 }, () => ({
            Unit: unit,
            Status: 'FMC'
          }))
        )
      },
      v_payload: {
        rows: units.flatMap(unit => {
          const payloads = [];
          // Add common payload types
          ['SkyTower II', 'EW Pod', 'SmartSensor', 'Extended Range Tank'].forEach(type => {
            for (let i = 0; i < 3; i++) {
              payloads.push({ Unit: unit, Type: type });
            }
          });
          return payloads;
        })
      },
      v_staffing: {
        rows: units.flatMap(unit => [
          ...Array.from({ length: 10 }, () => ({
            'Unit Name': unit,
            'MOS Number': '7318' // Pilot
          })),
          ...Array.from({ length: 10 }, () => ({
            'Unit Name': unit,
            'MOS Number': '7314' // Sensor Operator
          }))
        ])
      }
    }
  };
  
  return state;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Format number with appropriate precision
 */
function formatNumber(num, decimals = 2) {
  if (typeof num !== 'number' || isNaN(num)) return 'N/A';
  return num.toFixed(decimals);
}

/**
 * Print DES results summary
 */
function printDESResults(results, duration) {
  console.log('\n' + '='.repeat(80));
  console.log('DES SIMULATION RESULTS');
  console.log('='.repeat(80));
  console.log(`Execution time: ${formatDuration(duration)}`);
  console.log(`Horizon: ${results.horizon_hours} hours`);
  
  console.log('\n📊 Mission Statistics:');
  console.log(`  Requested: ${results.missions.requested}`);
  console.log(`  Started:   ${results.missions.started}`);
  console.log(`  Completed: ${results.missions.completed}`);
  console.log(`  Rejected:  ${results.missions.rejected}`);
  
  if (results.missions.rejected > 0) {
    console.log('\n❌ Rejection Reasons:');
    console.log(`  Aircraft: ${results.rejections.aircraft}`);
    console.log(`  Pilot:    ${results.rejections.pilot}`);
    console.log(`  SO:       ${results.rejections.so}`);
    console.log(`  Payload:  ${results.rejections.payload}`);
  }
  
  if (results.utilization && Object.keys(results.utilization).length > 0) {
    console.log('\n📈 Resource Utilization:');
    for (const [unit, util] of Object.entries(results.utilization)) {
      console.log(`  ${unit}:`);
      console.log(`    Aircraft: ${(util.aircraft * 100).toFixed(1)}%`);
      console.log(`    Pilot:   ${(util.pilot * 100).toFixed(1)}%`);
      console.log(`    SO:      ${(util.so * 100).toFixed(1)}%`);
    }
  }
  
  if (results.by_type && Object.keys(results.by_type).length > 0) {
    console.log('\n🎯 By Mission Type:');
    for (const [type, stats] of Object.entries(results.by_type)) {
      console.log(`  ${type}:`);
      console.log(`    Requested: ${stats.requested || 0}`);
      console.log(`    Started:   ${stats.started || 0}`);
      console.log(`    Completed: ${stats.completed || 0}`);
      console.log(`    Rejected:  ${stats.rejected || 0}`);
    }
  }
  
  if (verbose && results.timeline) {
    console.log(`\n📅 Timeline events: ${results.timeline.length}`);
    if (results.timeline.length > 0) {
      console.log('  First 5 events:');
      results.timeline.slice(0, 5).forEach((event, i) => {
        if (event.type === 'mission') {
          console.log(`    ${i + 1}. Mission ${event.mission_type} at ${event.demand_time.toFixed(2)}h, finishes at ${event.finish_time.toFixed(2)}h`);
        } else if (event.type === 'rejection') {
          console.log(`    ${i + 1}. Rejection (${event.reason}) at ${event.time.toFixed(2)}h`);
        }
      });
    }
  }
  
  if (results.initial_resources) {
    console.log('\n🔧 Initial Resources:');
    console.log(`  Units: ${results.initial_resources.units.join(', ')}`);
    if (results.initial_resources.overrides_applied) {
      console.log('  ⚠️  Resource overrides were applied');
    }
  }
}

/**
 * Print Monte Carlo results summary
 */
function printMonteCarloResults(results, duration) {
  console.log('\n' + '='.repeat(80));
  console.log('MONTE CARLO SIMULATION RESULTS');
  console.log('='.repeat(80));
  console.log(`Iterations: ${results.iterations}`);
  console.log(`Execution time: ${formatDuration(duration)}`);
  console.log(`Average time per iteration: ${formatDuration(duration / results.iterations)}`);
  console.log(`Horizon: ${results.horizon_hours} hours`);
  
  if (results.missions) {
    console.log('\n📊 Mission Statistics (Aggregated):');
    for (const [stat, data] of Object.entries(results.missions)) {
      if (data && typeof data === 'object' && data.mean !== undefined) {
        console.log(`  ${stat.charAt(0).toUpperCase() + stat.slice(1)}:`);
        console.log(`    Mean:    ${formatNumber(data.mean)}`);
        console.log(`    Median:  ${formatNumber(data.p50)}`);
        console.log(`    Min:     ${formatNumber(data.min)}`);
        console.log(`    Max:     ${formatNumber(data.max)}`);
        console.log(`    StdDev:  ${formatNumber(data.stddev)}`);
        console.log(`    P10:     ${formatNumber(data.p10)} | P90: ${formatNumber(data.p90)}`);
      }
    }
  }
  
  if (results.rejections && Object.keys(results.rejections).length > 0) {
    console.log('\n❌ Rejection Reasons (Aggregated):');
    for (const [reason, data] of Object.entries(results.rejections)) {
      if (data && typeof data === 'object' && data.mean !== undefined) {
        // Special case for 'so' to display as 'SO'
        const displayName = reason === 'so' ? 'SO' : reason.charAt(0).toUpperCase() + reason.slice(1);
        console.log(`  ${displayName}:`);
        console.log(`    Mean: ${formatNumber(data.mean)} | Median: ${formatNumber(data.p50)} | P90: ${formatNumber(data.p90)}`);
      }
    }
  }
  
  if (results.utilization && Object.keys(results.utilization).length > 0) {
    console.log('\n📈 Resource Utilization (Aggregated):');
    for (const [unit, util] of Object.entries(results.utilization)) {
      console.log(`  ${unit}:`);
      for (const [resource, data] of Object.entries(util)) {
        if (data && typeof data === 'object' && data.mean !== undefined) {
          // Special case for 'so' to display as 'SO'
          const displayName = resource === 'so' ? 'SO' : resource.charAt(0).toUpperCase() + resource.slice(1);
          console.log(`    ${displayName}:`);
          console.log(`      Mean: ${(data.mean * 100).toFixed(1)}% | Median: ${(data.p50 * 100).toFixed(1)}% | P90: ${(data.p90 * 100).toFixed(1)}%`);
        }
      }
    }
  }
  
  if (results.by_type && Object.keys(results.by_type).length > 0) {
    console.log('\n🎯 By Mission Type (Aggregated):');
    for (const [type, stats] of Object.entries(results.by_type)) {
      console.log(`  ${type}:`);
      for (const [stat, data] of Object.entries(stats)) {
        if (data && typeof data === 'object' && data.mean !== undefined) {
          console.log(`    ${stat.charAt(0).toUpperCase() + stat.slice(1)}: Mean=${formatNumber(data.mean)}, Median=${formatNumber(data.p50)}, P90=${formatNumber(data.p90)}`);
        }
      }
    }
  }
}

/**
 * Validate results structure
 */
function validateResults(results, isMonteCarlo = false) {
  const errors = [];
  
  if (isMonteCarlo) {
    if (!results.iterations) errors.push('Missing iterations count');
    if (!results.missions) errors.push('Missing missions statistics');
    if (results.missions) {
      for (const [key, value] of Object.entries(results.missions)) {
        if (!value || typeof value !== 'object') {
          errors.push(`Invalid missions.${key} structure`);
        } else if (typeof value.mean !== 'number') {
          errors.push(`Missing mean in missions.${key}`);
        }
      }
    }
  } else {
    if (typeof results.missions?.requested !== 'number') errors.push('Missing missions.requested');
    if (typeof results.missions?.started !== 'number') errors.push('Missing missions.started');
    if (typeof results.missions?.completed !== 'number') errors.push('Missing missions.completed');
    if (typeof results.missions?.rejected !== 'number') errors.push('Missing missions.rejected');
  }
  
  if (errors.length > 0) {
    console.warn('\n⚠️  Validation warnings:');
    errors.forEach(err => console.warn(`  - ${err}`));
    return false;
  }
  
  return true;
}

// Main execution
(async () => {
  try {
    console.log('🧪 Simulation Test Script');
    console.log('='.repeat(80));
    console.log(`Scenario: ${scenarioPath}`);
    
    // Load scenario
    const scenarioContent = fs.readFileSync(scenarioPath, 'utf8');
    const scenario = JSON.parse(scenarioContent);
    console.log(`Scenario name: ${scenario.name || 'Unnamed'}`);
    console.log(`Horizon: ${scenario.horizon_hours} hours`);
    
    // Create mock state
    const state = createMockState(scenario);
    console.log(`Mock state created with units: ${state.tables.v_unit.rows.map(r => r.Unit).join(', ')}`);
    
    // Run DES simulation
    if (!monteOnly) {
      console.log('\n🔄 Running DES simulation...');
      const desStart = Date.now();
      const desResults = await runSimulation(scenario, { state });
      const desDuration = Date.now() - desStart;
      
      const desValid = validateResults(desResults, false);
      printDESResults(desResults, desDuration);
      
      if (!desValid) {
        console.warn('\n⚠️  DES results validation failed - check output structure');
      } else {
        console.log('\n✅ DES simulation completed successfully');
      }
    }
    
    // Run Monte Carlo simulation
    if (!desOnly) {
      console.log('\n🔄 Running Monte Carlo simulation...');
      console.log(`  Iterations: ${iterations}`);
      const monteStart = Date.now();
      const monteResults = await runMonteCarlo(scenario, {
        state,
        iterations,
        keepIterations: false
      });
      const monteDuration = Date.now() - monteStart;
      
      const monteValid = validateResults(monteResults, true);
      printMonteCarloResults(monteResults, monteDuration);
      
      if (!monteValid) {
        console.warn('\n⚠️  Monte Carlo results validation failed - check output structure');
      } else {
        console.log('\n✅ Monte Carlo simulation completed successfully');
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✨ Test completed');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error running simulation:');
    console.error(error);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
})();

