#!/usr/bin/env node

/**
 * Test script for DES and Monte Carlo simulation engines
 * Compares JavaScript and Rust native (.node) implementations
 * 
 * The Rust implementation uses native N-API addons (.node files) for maximum performance:
 *   - Native binary execution (not WASM) - lightning fast
 *   - Full threading support with rayon for parallel Monte Carlo
 *   - No JS↔WASM conversion overhead
 * 
 * Usage:
 *   node test-sim-rs.js <scenario-file> [options]
 * 
 * Options:
 *   --iterations <N>     Number of Monte Carlo iterations (default: 100)
 *   --monte-only         Only run Monte Carlo (skip DES)
 *   --des-only           Only run DES (skip Monte Carlo)
 *   --verbose            Show detailed output
 *   --js-only            Only run JavaScript implementations
 *   --wasm-only          Only run Rust native implementations (backward compatibility flag name)
 * 
 * Example:
 *   node test-sim-rs.js sim/des/scenarios/baseline.json
 *   node test-sim-rs.js sim/des/scenarios/smoke-1unit-1type-hourly-short-flight.json --iterations 50
 */

const fs = require('fs');
const path = require('path');
const { runSimulation: runSimulationJS } = require('./sim/des/engine');
const { runMonteCarlo: runMonteCarloJS } = require('./sim/monte/engine');
// Rust native addons (.node files) - much faster than JavaScript
const { runSimulation: runSimulationNative, runMonteCarlo: runMonteCarloNative } = require('./wasm/bindings');

// Parse command line arguments
const args = process.argv.slice(2);
const scenarioFile = args.find(arg => !arg.startsWith('--'));
const iterationsArg = args.find((arg, i) => arg === '--iterations' || arg.startsWith('--iterations='));
const iterations = iterationsArg 
  ? parseInt(iterationsArg.includes('=') ? iterationsArg.split('=')[1] : args[args.indexOf(iterationsArg) + 1] || '100', 10)
  : 100;
const monteOnly = args.includes('--monte-only');
const desOnly = args.includes('--des-only');
const verbose = args.includes('--verbose');
const jsOnly = args.includes('--js-only');
const wasmOnly = args.includes('--wasm-only');

if (!scenarioFile) {
  console.error('Error: Scenario file path required');
  console.error('\nUsage: node test-sim-rs.js <scenario-file> [options]');
  console.error('\nOptions:');
  console.error('  --iterations <N>     Number of Monte Carlo iterations (default: 100)');
  console.error('  --monte-only         Only run Monte Carlo (skip DES)');
  console.error('  --des-only           Only run DES (skip Monte Carlo)');
  console.error('  --verbose            Show detailed output');
  console.error('  --js-only            Only run JavaScript implementations');
  console.error('  --wasm-only          Only run WASM implementations');
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
 * Calculate speedup factor
 * Returns "X.XXx faster" if WASM is faster, or "X.XXx slower" if WASM is slower
 */
function calculateSpeedup(jsTime, wasmTime) {
  if (!jsTime || !wasmTime || wasmTime === 0 || jsTime === 0) return 'N/A';
  if (wasmTime < jsTime) {
    // WASM is faster
    return (jsTime / wasmTime).toFixed(2) + 'x faster';
  } else {
    // WASM is slower
    return (wasmTime / jsTime).toFixed(2) + 'x slower';
  }
}

/**
 * Print comparison table header
 */
function printTableHeader() {
  console.log('\n' + '='.repeat(100));
  console.log('PERFORMANCE COMPARISON: JavaScript vs Rust Native (.node)');
  console.log('='.repeat(100));
  console.log(
    'Implementation'.padEnd(20) +
    'Execution Time'.padEnd(20) +
    'Time/Iteration'.padEnd(20) +
    'Speedup'.padEnd(15) +
    'Status'
  );
  console.log('-'.repeat(100));
}

/**
 * Print comparison table row
 */
function printTableRow(impl, time, timePerIter, speedup, status) {
  const timeStr = formatDuration(time);
  const iterStr = timePerIter ? formatDuration(timePerIter) : 'N/A';
  const speedupStr = speedup || 'N/A';
  const statusStr = status || '✅';
  
  console.log(
    impl.padEnd(20) +
    timeStr.padEnd(20) +
    iterStr.padEnd(20) +
    speedupStr.padEnd(15) +
    statusStr
  );
}

/**
 * Print detailed DES results
 */
function printDESResults(results, duration, impl) {
  if (!verbose) return;
  
  console.log(`\n📊 ${impl} DES Results:`);
  console.log(`  Execution time: ${formatDuration(duration)}`);
  console.log(`  Missions requested: ${results.missions.requested}`);
  console.log(`  Missions started: ${results.missions.started}`);
  console.log(`  Missions completed: ${results.missions.completed}`);
  console.log(`  Missions rejected: ${results.missions.rejected}`);
}

/**
 * Print detailed Monte Carlo results
 */
function printMonteCarloResults(results, duration, impl) {
  if (!verbose) return;
  
  console.log(`\n📊 ${impl} Monte Carlo Results:`);
  console.log(`  Execution time: ${formatDuration(duration)}`);
  console.log(`  Iterations: ${results.iterations}`);
  if (results.missions?.completed) {
    console.log(`  Avg missions completed: ${formatNumber(results.missions.completed.mean)}`);
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
  
  return errors.length === 0;
}

/**
 * Compare two results objects for consistency
 */
function compareResults(jsResults, wasmResults, isMonteCarlo = false) {
  if (isMonteCarlo) {
    // For Monte Carlo, we compare aggregated statistics
    // They should be similar but not identical due to randomness
    const jsCompleted = jsResults.missions?.completed?.mean || 0;
    const wasmCompleted = wasmResults.missions?.completed?.mean || 0;
    const diff = Math.abs(jsCompleted - wasmCompleted);
    // Use a more lenient tolerance: 5% or absolute difference based on expected variance
    // For large iteration counts, use relative tolerance; for small counts, use absolute
    const avgCompleted = (jsCompleted + wasmCompleted) / 2;
    const relativeTolerance = avgCompleted * 0.05; // 5% relative tolerance
    const absoluteTolerance = Math.max(5, avgCompleted * 0.02); // At least 5 missions or 2%
    const tolerance = Math.max(relativeTolerance, absoluteTolerance);
    
    if (diff > tolerance) {
      const pctDiff = avgCompleted > 0 ? ((diff / avgCompleted) * 100).toFixed(1) : 'N/A';
      return `⚠️  Results differ (${formatNumber(diff)} missions, ${pctDiff}%)`;
    }
    return '✅ Results consistent';
  } else {
    // For DES, results should be identical (same random seed would be needed)
    // But we'll just check structure for now
    if (jsResults.missions && wasmResults.missions) {
      return '✅ Structure matches';
    }
    return '⚠️  Structure mismatch';
  }
}

// Main execution
(async () => {
  try {
    console.log('🧪 Simulation Test Script - JavaScript vs Rust Native (.node)');
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
    
    const comparisonData = {
      des: { js: null, wasm: null },
      monte: { js: null, wasm: null }
    };
    
    // Run DES simulation
    if (!monteOnly) {
      console.log('\n🔄 Running DES simulations...');
      
      // JavaScript DES
      if (!wasmOnly) {
        try {
          console.log('  Running JavaScript DES...');
          const jsStart = Date.now();
          const jsResults = await runSimulationJS(scenario, { state });
          const jsDuration = Date.now() - jsStart;
          const jsValid = validateResults(jsResults, false);
          
          comparisonData.des.js = {
            results: jsResults,
            duration: jsDuration,
            valid: jsValid
          };
          
          printDESResults(jsResults, jsDuration, 'JavaScript');
          if (!jsValid) {
            console.warn('  ⚠️  JavaScript DES results validation failed');
          }
        } catch (error) {
          console.error(`  ❌ JavaScript DES failed: ${error.message}`);
          comparisonData.des.js = { error: error.message };
        }
      }
      
      // Rust Native DES (.node binary)
      if (!jsOnly) {
        try {
          console.log('  Running Rust Native DES (.node)...');
          const nativeStart = Date.now();
          const nativeResults = await runSimulationNative(scenario, { state });
          const nativeDuration = Date.now() - nativeStart;
          const nativeValid = validateResults(nativeResults, false);
          
          comparisonData.des.wasm = {
            results: nativeResults,
            duration: nativeDuration,
            valid: nativeValid
          };
          
          printDESResults(nativeResults, nativeDuration, 'Rust Native');
          if (!nativeValid) {
            console.warn('  ⚠️  Rust Native DES results validation failed');
          }
        } catch (error) {
          console.error(`  ❌ Rust Native DES failed: ${error.message}`);
          comparisonData.des.wasm = { error: error.message };
        }
      }
    }
    
    // Run Monte Carlo simulation
    if (!desOnly) {
      console.log('\n🔄 Running Monte Carlo simulations...');
      console.log(`  Iterations: ${iterations}`);
      
      // JavaScript Monte Carlo
      if (!wasmOnly) {
        try {
          console.log('  Running JavaScript Monte Carlo...');
          const jsStart = Date.now();
          const jsResults = await runMonteCarloJS(scenario, {
            state,
            iterations,
            keepIterations: false
          });
          const jsDuration = Date.now() - jsStart;
          const jsValid = validateResults(jsResults, true);
          
          comparisonData.monte.js = {
            results: jsResults,
            duration: jsDuration,
            valid: jsValid
          };
          
          printMonteCarloResults(jsResults, jsDuration, 'JavaScript');
          if (!jsValid) {
            console.warn('  ⚠️  JavaScript Monte Carlo results validation failed');
          }
        } catch (error) {
          console.error(`  ❌ JavaScript Monte Carlo failed: ${error.message}`);
          comparisonData.monte.js = { error: error.message };
        }
      }
      
      // Rust Native Monte Carlo (.node binary with rayon parallel processing)
      if (!jsOnly) {
        try {
          console.log('  Running Rust Native Monte Carlo (.node with rayon)...');
          const nativeStart = Date.now();
          const nativeResults = await runMonteCarloNative(scenario, {
            state,
            iterations,
            keepIterations: false
          });
          const nativeDuration = Date.now() - nativeStart;
          const nativeValid = validateResults(nativeResults, true);
          
          comparisonData.monte.wasm = {
            results: nativeResults,
            duration: nativeDuration,
            valid: nativeValid
          };
          
          printMonteCarloResults(nativeResults, nativeDuration, 'Rust Native');
          if (!nativeValid) {
            console.warn('  ⚠️  Rust Native Monte Carlo results validation failed');
          }
        } catch (error) {
          console.error(`  ❌ Rust Native Monte Carlo failed: ${error.message}`);
          comparisonData.monte.wasm = { error: error.message };
        }
      }
    }
    
    // Print comparison table
    printTableHeader();
    
    // DES comparison
    if (!monteOnly) {
      const desJs = comparisonData.des.js;
      const desWasm = comparisonData.des.wasm;
      
      if (desJs && !desJs.error) {
        printTableRow(
          'DES (JavaScript)',
          desJs.duration,
          null,
          null,
          desJs.valid ? '✅' : '⚠️'
        );
      }
      
      if (desWasm && !desWasm.error) {
        const speedup = desJs && !desJs.error 
          ? calculateSpeedup(desJs.duration, desWasm.duration)
          : null;
        const comparison = desJs && !desJs.error && desWasm && !desWasm.error
          ? compareResults(desJs.results, desWasm.results, false)
          : null;
        
        printTableRow(
          'DES (Rust Native)',
          desWasm.duration,
          null,
          speedup,
          desWasm.valid ? (comparison || '✅') : '⚠️'
        );
      }
    }
    
    // Monte Carlo comparison
    if (!desOnly) {
      const monteJs = comparisonData.monte.js;
      const monteWasm = comparisonData.monte.wasm;
      
      if (monteJs && !monteJs.error) {
        printTableRow(
          'Monte Carlo (JS)',
          monteJs.duration,
          monteJs.duration / iterations,
          null,
          monteJs.valid ? '✅' : '⚠️'
        );
      }
      
      if (monteWasm && !monteWasm.error) {
        const speedup = monteJs && !monteJs.error
          ? calculateSpeedup(monteJs.duration, monteWasm.duration)
          : null;
        const comparison = monteJs && !monteJs.error && monteWasm && !monteWasm.error
          ? compareResults(monteJs.results, monteWasm.results, true)
          : null;
        
        printTableRow(
          'Monte Carlo (Rust Native)',
          monteWasm.duration,
          monteWasm.duration / iterations,
          speedup,
          monteWasm.valid ? (comparison || '✅') : '⚠️'
        );
      }
    }
    
    console.log('-'.repeat(100));
    
    // Summary
    console.log('\n📈 Performance Summary:');
    if (!monteOnly && comparisonData.des.js && !comparisonData.des.js.error && 
        comparisonData.des.wasm && !comparisonData.des.wasm.error) {
      const jsTime = comparisonData.des.js.duration;
      const wasmTime = comparisonData.des.wasm.duration;
      const speedup = calculateSpeedup(jsTime, wasmTime);
      console.log(`  DES: Rust Native is ${speedup} than JavaScript (JS: ${formatDuration(jsTime)}, Native: ${formatDuration(wasmTime)})`);
    }
    
    if (!desOnly && comparisonData.monte.js && !comparisonData.monte.js.error && 
        comparisonData.monte.wasm && !comparisonData.monte.wasm.error) {
      const jsTime = comparisonData.monte.js.duration;
      const nativeTime = comparisonData.monte.wasm.duration;
      const speedup = calculateSpeedup(jsTime, nativeTime);
      console.log(`  Monte Carlo: Rust Native is ${speedup} than JavaScript (JS: ${formatDuration(jsTime)}, Native: ${formatDuration(nativeTime)})`);
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('✨ Test completed');
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
