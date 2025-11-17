// Benchmark binary for profiling DES and Monte Carlo engines
// Usage: 
//   cargo run --release --bin bench -- <scenario-file> [--monte] [--iterations N]
//   cargo flamegraph --bin bench -- <scenario-file> [--monte] [--iterations N]
//
// Options:
//   --monte          Run Monte Carlo instead of DES
//   --iterations N   Number of Monte Carlo iterations (default: 100)

use std::env;
use std::fs;
use sim_native_des::{run_simulation_internal, Scenario, Options, State, StateTable};
use sim_native_monte::{run_monte_carlo_internal, MonteCarloOptions};
use serde_json::Value;

fn create_mock_state(_scenario: &Scenario) -> State {
    // Use default units (can be customized based on scenario if needed)
    let units = vec!["VMU-1".to_string(), "VMU-3".to_string()];

    let mut tables = std::collections::HashMap::new();

    // Create v_unit table
    let mut unit_rows = Vec::new();
    for unit in &units {
        let mut row = std::collections::HashMap::new();
        row.insert("Unit".to_string(), Value::String(unit.clone()));
        unit_rows.push(row);
    }
    tables.insert("v_unit".to_string(), StateTable { rows: unit_rows });

    // Create v_aircraft table (5 FMC aircraft per unit)
    let mut aircraft_rows = Vec::new();
    for unit in &units {
        for _ in 0..5 {
            let mut row = std::collections::HashMap::new();
            row.insert("Unit".to_string(), Value::String(unit.clone()));
            row.insert("Status".to_string(), Value::String("FMC".to_string()));
            aircraft_rows.push(row);
        }
    }
    tables.insert("v_aircraft".to_string(), StateTable { rows: aircraft_rows });

    // Create v_payload table
    let mut payload_rows = Vec::new();
    let payload_types = vec!["SkyTower II", "EW Pod", "SmartSensor", "Extended Range Tank"];
    for unit in &units {
        for ptype in &payload_types {
            for _ in 0..3 {
                let mut row = std::collections::HashMap::new();
                row.insert("Unit".to_string(), Value::String(unit.clone()));
                row.insert("Type".to_string(), Value::String(ptype.to_string()));
                payload_rows.push(row);
            }
        }
    }
    tables.insert("v_payload".to_string(), StateTable { rows: payload_rows });

    // Create v_staffing table (10 pilots + 10 SOs per unit)
    let mut staffing_rows = Vec::new();
    for unit in &units {
        for _ in 0..10 {
            let mut row = std::collections::HashMap::new();
            row.insert("Unit Name".to_string(), Value::String(unit.clone()));
            row.insert("MOS Number".to_string(), Value::String("7318".to_string())); // Pilot
            staffing_rows.push(row);
        }
        for _ in 0..10 {
            let mut row = std::collections::HashMap::new();
            row.insert("Unit Name".to_string(), Value::String(unit.clone()));
            row.insert("MOS Number".to_string(), Value::String("7314".to_string())); // SO
            staffing_rows.push(row);
        }
    }
    tables.insert("v_staffing".to_string(), StateTable { rows: staffing_rows });

    State { tables }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: cargo run --release --bin bench -- <scenario-file> [--monte] [--iterations N]");
        eprintln!("For flamegraph: cargo flamegraph --bin bench -- <scenario-file> [--monte] [--iterations N]");
        eprintln!("\nOptions:");
        eprintln!("  --monte          Run Monte Carlo instead of DES");
        eprintln!("  --iterations N   Number of Monte Carlo iterations (default: 100)");
        eprintln!("\nExamples:");
        eprintln!("  cd sim-native/bench");
        eprintln!("  cargo run --release --bin bench -- ../../backend/sim/des/scenarios/baseline.json");
        eprintln!("  cargo run --release --bin bench -- ../../backend/sim/des/scenarios/baseline.json --monte --iterations 50");
        std::process::exit(1);
    }

    let scenario_path = &args[1];
    let run_monte = args.contains(&"--monte".to_string());
    let iterations = args.iter()
        .position(|x| x == "--iterations")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(100);

    // Try to read the file, with better error message
    let scenario_content = fs::read_to_string(scenario_path)
        .unwrap_or_else(|e| {
            eprintln!("Failed to read scenario file: {}", scenario_path);
            eprintln!("Error: {}", e);
            eprintln!("\nTip: Use a path relative to sim-native/bench/ or an absolute path");
            std::process::exit(1);
        });
    let scenario: Scenario = serde_json::from_str(&scenario_content)
        .expect("Failed to parse scenario JSON");

    // Create mock state
    let state = create_mock_state(&scenario);

    if run_monte {
        println!("Running Monte Carlo simulation benchmark...");
        println!("Scenario: {}", scenario_path);
        println!("Horizon: {} hours", scenario.horizon_hours);
        println!("Iterations: {}", iterations);
        
        let monte_options = MonteCarloOptions {
            iterations: Some(iterations),
            keep_iterations: Some(false),
            state: Some(state),
            overrides: None,
        };
        
        let start = std::time::Instant::now();
        
        match run_monte_carlo_internal(scenario, monte_options) {
            Ok(results) => {
                let duration = start.elapsed();
                println!("\nMonte Carlo simulation completed in {:?}", duration);
                println!("Time per iteration: {:?}", duration / iterations);
                if let Some(completed_stats) = results.missions.get("completed") {
                    println!("Avg missions completed: {:.2}", completed_stats.mean);
                }
                if let Some(started_stats) = results.missions.get("started") {
                    println!("Avg missions started: {:.2}", started_stats.mean);
                }
                if let Some(rejected_stats) = results.missions.get("rejected") {
                    println!("Avg missions rejected: {:.2}", rejected_stats.mean);
                }
            }
            Err(e) => {
                eprintln!("Monte Carlo simulation failed: {}", e);
                std::process::exit(1);
            }
        }
    } else {
        let options = Options {
            state: Some(state),
            overrides: None,
        };

        println!("Running DES simulation benchmark...");
        println!("Scenario: {}", scenario_path);
        println!("Horizon: {} hours", scenario.horizon_hours);
        
        let start = std::time::Instant::now();
        
        match run_simulation_internal(scenario, options) {
            Ok(results) => {
                let duration = start.elapsed();
                println!("\nSimulation completed in {:?}", duration);
                println!("Missions requested: {}", results.missions.requested);
                println!("Missions started: {}", results.missions.started);
                println!("Missions completed: {}", results.missions.completed);
                println!("Missions rejected: {}", results.missions.rejected);
            }
            Err(e) => {
                eprintln!("Simulation failed: {}", e);
                std::process::exit(1);
            }
        }
    }
}

