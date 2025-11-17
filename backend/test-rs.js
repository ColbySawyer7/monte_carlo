#!/usr/bin/env node

/**
 * Test script for Rust native simulation engines (.node binaries)
 * 
 * Tests the native N-API addons built with napi-rs:
 *   - Native binary execution (not WASM) - lightning fast
 *   - Full threading support with rayon for parallel Monte Carlo
 *   - No JS↔WASM conversion overhead - direct N-API calls
 * 
 * Usage:
 *   node test-rs.js <scenario-file> [options]
 * 
 * Options:
 *   --iterations <N>     Number of Monte Carlo iterations (default: 1000)
 *   --monte-only         Only run Monte Carlo (skip DES)
 *   --des-only           Only run DES (skip Monte Carlo)
 *   --verbose            Show detailed output
 *   --warmup             Run warmup iterations before timing
 * 
 * Example:
 *   node test-rs.js sim/des/scenarios/baseline.json
 *   node test-rs.js sim/des/scenarios/baseline.json --iterations 5000 --verbose
 */

const fs = require('fs');
const path = require('path');
// Rust native addons (.node files) - lightning fast native binaries
const { runSimulation, runMonteCarlo } = require('./wasm/bindings');

// Parse command line arguments
const args = process.argv.slice(2);
const scenarioFile = args.find(arg => !arg.startsWith('--'));
const iterationsArg = args.find((arg, i) => arg === '--iterations' || arg.startsWith('--iterations='));
const iterations = iterationsArg 
  ? parseInt(iterationsArg.includes('=') ? iterationsArg.split('=')[1] : args[args.indexOf(iterationsArg) + 1] || '1000', 10)
  : 1000;
const monteOnly = args.includes('--monte-only');
const desOnly = args.includes('--des-only');
const verbose = args.includes('--verbose');
const warmup = args.includes('--warmup');

if (!scenarioFile) {
  console.error('Error: Scenario file path required');
  console.error('\nUsage: node test-rs.js <scenario-file> [options]');
  console.error('\nOptions:');
  console.error('  --iterations <N>     Number of Monte Carlo iterations (default: 1000)');
  console.error('  --monte-only         Only run Monte Carlo (skip DES)');
  console.error('  --des-only           Only run DES (skip Monte Carlo)');
  console.error('  --verbose            Show detailed output');
  console.error('  --warmup             Run warmup iterations before timing');
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
  
  if (errors.length > 0 && verbose) {
    console.warn('  Validation errors:', errors);
  }
  
  return errors.length === 0;
}

/**
 * Print DES results
 */
function printDESResults(results, duration) {
  console.log('\n📊 DES Simulation Results:');
  console.log(`  Execution time: ${formatDuration(duration)}`);
  console.log(`  Horizon: ${results.horizon_hours} hours`);
  console.log(`  Missions requested: ${results.missions.requested}`);
  console.log(`  Missions started: ${results.missions.started}`);
  console.log(`  Missions completed: ${results.missions.completed}`);
  console.log(`  Missions rejected: ${results.missions.rejected}`);
  console.log(`  Rejections - Aircraft: ${results.rejections.aircraft}, Pilot: ${results.rejections.pilot}, SO: ${results.rejections.so}, Payload: ${results.rejections.payload}`);
  
  if (results.utilization && Object.keys(results.utilization).length > 0) {
    console.log('\n  Utilization by unit:');
    for (const [unit, util] of Object.entries(results.utilization)) {
      console.log(`    ${unit}: Aircraft ${(util.aircraft * 100).toFixed(1)}%, Pilot ${(util.pilot * 100).toFixed(1)}%, SO ${(util.so * 100).toFixed(1)}%`);
    }
  }
  
  if (results.by_type && Object.keys(results.by_type).length > 0) {
    console.log('\n  Missions by type:');
    for (const [type, stats] of Object.entries(results.by_type)) {
      console.log(`    ${type}: Requested ${stats.requested}, Started ${stats.started}, Completed ${stats.completed}, Rejected ${stats.rejected}`);
    }
  }
  
  if (results.initial_resources) {
    console.log('\n  Initial resources:');
    console.log(`    Units: ${results.initial_resources.units.join(', ')}`);
    console.log(`    Aircraft: ${JSON.stringify(Object.fromEntries(
      results.initial_resources.units.map(u => [u, results.initial_resources.aircraft_by_unit[u] || 0])
    ))}`);
  }
}

/**
 * Print Monte Carlo results
 */
function printMonteCarloResults(results, duration) {
  console.log('\n📊 Monte Carlo Simulation Results:');
  console.log(`  Execution time: ${formatDuration(duration)}`);
  console.log(`  Time per iteration: ${formatDuration(duration / results.iterations)}`);
  console.log(`  Iterations: ${results.iterations}`);
  console.log(`  Horizon: ${results.horizon_hours} hours`);
  
  if (results.missions) {
    console.log('\n  Missions statistics:');
    for (const [key, stats] of Object.entries(results.missions)) {
      console.log(`    ${key}:`);
      console.log(`      Mean: ${formatNumber(stats.mean)}, StdDev: ${formatNumber(stats.stddev)}`);
      console.log(`      Min: ${formatNumber(stats.min)}, Max: ${formatNumber(stats.max)}`);
      console.log(`      Percentiles: P10=${formatNumber(stats.p10)}, P25=${formatNumber(stats.p25)}, P50=${formatNumber(stats.p50)}, P75=${formatNumber(stats.p75)}, P90=${formatNumber(stats.p90)}, P95=${formatNumber(stats.p95)}, P99=${formatNumber(stats.p99)}`);
    }
  }
  
  if (results.rejections) {
    console.log('\n  Rejections statistics:');
    for (const [key, stats] of Object.entries(results.rejections)) {
      console.log(`    ${key}: Mean=${formatNumber(stats.mean)}, StdDev=${formatNumber(stats.stddev)}`);
    }
  }
  
  if (results.utilization && Object.keys(results.utilization).length > 0) {
    console.log('\n  Utilization statistics by unit:');
    for (const [unit, utilStats] of Object.entries(results.utilization)) {
      console.log(`    ${unit}:`);
      for (const [resource, stats] of Object.entries(utilStats)) {
        console.log(`      ${resource}: Mean=${(stats.mean * 100).toFixed(1)}%, StdDev=${(stats.stddev * 100).toFixed(1)}%`);
      }
    }
  }
  
  if (results.by_type && Object.keys(results.by_type).length > 0) {
    console.log('\n  Missions by type statistics:');
    for (const [type, typeStats] of Object.entries(results.by_type)) {
      console.log(`    ${type}:`);
      for (const [stat, stats] of Object.entries(typeStats)) {
        console.log(`      ${stat}: Mean=${formatNumber(stats.mean)}, StdDev=${formatNumber(stats.stddev)}`);
      }
    }
  }
}

// Main execution
(async () => {
  try {
    console.log('🚀 Rust Native Simulation Test');
    console.log('='.repeat(100));
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
      
      // Warmup run if requested
      if (warmup) {
        console.log('  Warming up...');
        try {
          await runSimulation(scenario, { state });
        } catch (error) {
          console.warn(`  ⚠️  Warmup failed: ${error.message}`);
        }
      }
      
      try {
        const start = Date.now();
        const results = await runSimulation(scenario, { state });
        const duration = Date.now() - start;
        const valid = validateResults(results, false);
        
        if (valid) {
          console.log(`  ✅ DES simulation completed successfully in ${formatDuration(duration)}`);
          if (verbose) {
            printDESResults(results, duration);
          }
        } else {
          console.warn('  ⚠️  DES simulation completed but results validation failed');
          if (verbose) {
            printDESResults(results, duration);
          }
        }
      } catch (error) {
        console.error(`  ❌ DES simulation failed: ${error.message}`);
        if (verbose && error.stack) {
          console.error('  Stack trace:', error.stack);
        }
        process.exit(1);
      }
    }
    
    // Run Monte Carlo simulation
    if (!desOnly) {
      console.log('\n🔄 Running Monte Carlo simulation...');
      console.log(`  Iterations: ${iterations}`);
      
      // Warmup run if requested
      if (warmup) {
        console.log('  Warming up...');
        try {
          await runMonteCarlo(scenario, {
            state,
            iterations: Math.min(10, iterations),
            keepIterations: false
          });
        } catch (error) {
          console.warn(`  ⚠️  Warmup failed: ${error.message}`);
        }
      }
      
      try {
        const start = Date.now();
        const results = await runMonteCarlo(scenario, {
          state,
          iterations,
          keepIterations: false
        });
        const duration = Date.now() - start;
        const valid = validateResults(results, true);
        
        if (valid) {
          console.log(`  ✅ Monte Carlo simulation completed successfully in ${formatDuration(duration)}`);
          console.log(`  ⚡ Throughput: ${formatNumber(iterations / (duration / 1000))} iterations/second`);
          printMonteCarloResults(results, duration);
        } else {
          console.warn('  ⚠️  Monte Carlo simulation completed but results validation failed');
          if (verbose) {
            printMonteCarloResults(results, duration);
          }
        }
      } catch (error) {
        console.error(`  ❌ Monte Carlo simulation failed: ${error.message}`);
        if (verbose && error.stack) {
          console.error('  Stack trace:', error.stack);
        }
        process.exit(1);
      }
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('✨ Test completed successfully');
    console.log('='.repeat(100));
    
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
