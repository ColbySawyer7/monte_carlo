// DES Engine - N-API bindings
// This implements a discrete event simulation engine for aircraft mission operations

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use rand::Rng;
use std::result::Result as StdResult;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct Distribution {
    #[serde(rename = "type")]
    dist_type: String,
    value_hours: Option<f64>,
    value: Option<f64>,
    rate_per_hour: Option<f64>,
    rate: Option<f64>,
    a: Option<f64>,
    m: Option<f64>,
    b: Option<f64>,
    mu: Option<f64>,
    sigma: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct Aircrew {
    pilot: Option<u32>,
    so: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct MissionType {
    name: String,
    priority: Option<u32>,
    required_payload_types: Option<Vec<String>>,
    required_aircrew: Option<Aircrew>,
    flight_time: Distribution,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct Demand {
    mission_type: String,
    #[serde(rename = "type")]
    demand_type: Option<String>,
    rate_per_hour: Option<f64>,
    every_hours: Option<f64>,
    interval_hours: Option<f64>,
    start_at_hours: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct UnitPolicy {
    assignment: Option<String>,
    mission_split: Option<std::collections::HashMap<String, f64>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct ProcessTimes {
    preflight: Option<Distribution>,
    postflight: Option<Distribution>,
    turnaround: Option<Distribution>,
    mount_times: Option<std::collections::HashMap<String, Distribution>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct Scenario {
    pub name: Option<String>,
    pub horizon_hours: f64,
    pub demand: Vec<Demand>,
    pub mission_types: Vec<MissionType>,
    pub process_times: Option<ProcessTimes>,
    pub unit_policy: Option<UnitPolicy>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StateTable {
    pub rows: Vec<std::collections::HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct State {
    pub tables: std::collections::HashMap<String, StateTable>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UnitOverrides {
    aircraft: Option<f64>,
    pilot: Option<f64>,
    so: Option<f64>,
    payload_per_type: Option<f64>,
    payload_by_type: Option<std::collections::HashMap<String, f64>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Overrides {
    units: Option<std::collections::HashMap<String, UnitOverrides>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Options {
    pub state: Option<State>,
    pub overrides: Option<Overrides>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InitialResources {
    units: Vec<String>,
    aircraft_by_unit: std::collections::HashMap<String, u32>,
    crew_by_unit: std::collections::HashMap<String, CrewCounts>,
    payload_by_unit: std::collections::HashMap<String, std::collections::HashMap<String, u32>>,
    overrides_applied: bool,
}

#[derive(Debug, Clone, Serialize)]
struct CrewCounts {
    pilot: u32,
    so: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Utilization {
    pub aircraft: f64,
    pub pilot: f64,
    pub so: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MissionStats {
    pub requested: u32,
    pub started: u32,
    pub completed: u32,
    pub rejected: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Rejections {
    pub aircraft: u32,
    pub pilot: u32,
    pub so: u32,
    pub payload: u32,
}

#[derive(Debug, Clone, Serialize)]
struct TimelineSegment {
    name: String,
    start: f64,
    end: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum TimelineEvent {
    #[serde(rename = "mission")]
    Mission {
        unit: String,
        mission_type: String,
        demand_time: f64,
        finish_time: f64,
        segments: Vec<TimelineSegment>,
    },
    #[serde(rename = "rejection")]
    Rejection {
        time: f64,
        unit: String,
        mission_type: String,
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct Results {
    pub horizon_hours: f64,
    pub missions: MissionStats,
    pub rejections: Rejections,
    pub utilization: std::collections::HashMap<String, Utilization>,
    pub by_type: std::collections::HashMap<String, MissionStats>,
    pub timeline: Vec<TimelineEvent>,
    pub initial_resources: InitialResources,
}

// ============================================================================
// RESOURCE POOL
// ============================================================================

struct ResourcePool {
    #[allow(dead_code)]
    name: String, // For debugging/logging purposes
    total: u32,
    held: Vec<f64>, // Release times (kept sorted for efficient binary search)
    busy_time: f64,
    allocations: u32,
    denials: u32,
    last_cleanup_time: f64, // Track last cleanup to avoid redundant work
}

impl ResourcePool {
    fn new(name: String, total: u32) -> Self {
        ResourcePool {
            name,
            total,
            held: Vec::new(),
            busy_time: 0.0,
            allocations: 0,
            denials: 0,
            last_cleanup_time: f64::NEG_INFINITY,
        }
    }

    fn available_at(&mut self, time: f64) -> u32 {
        // Only cleanup if time has advanced (optimization)
        if time > self.last_cleanup_time {
            // Use binary search to find first element > time, then truncate
            // This is O(log n) + O(k) where k is number of expired items
            let cutoff = self.held.partition_point(|&t| t <= time);
            if cutoff > 0 {
                self.held.drain(0..cutoff);
            }
            self.last_cleanup_time = time;
        }
        self.total.saturating_sub(self.held.len() as u32)
    }

    fn try_acquire(&mut self, time: f64, duration_hours: f64, count: u32) -> bool {
        let avail = self.available_at(time);
        if avail >= count {
            // Acquire resources: record when they'll be released
            // Insert in sorted order to maintain invariant
            let release_time = time + duration_hours;
            // Find insertion point using binary search
            let insert_pos = self.held.partition_point(|&t| t <= release_time);
            // Insert all items at the same position (they all have the same release_time)
            for _ in 0..count {
                self.held.insert(insert_pos, release_time);
            }
            self.allocations += count;
            self.busy_time += duration_hours * count as f64;
            true
        } else {
            self.denials += count;
            false
        }
    }

    fn utilization(&self, horizon_hours: f64) -> f64 {
        if self.total == 0 || horizon_hours <= 0.0 {
            return 0.0;
        }
        (self.busy_time / (self.total as f64 * horizon_hours)).min(1.0)
    }
}

struct UnitPools {
    aircraft: ResourcePool,
    pilot: ResourcePool,
    so: ResourcePool,
    payloads: std::collections::HashMap<String, ResourcePool>,
    mission_finishes: Vec<f64>,
}

// ============================================================================
// DISTRIBUTION SAMPLING
// ============================================================================

fn sample_dist(dist: &Distribution, rng: &mut impl Rng) -> f64 {
    let dist_type = dist.dist_type.as_str();
    
    match dist_type {
        "deterministic" => {
            dist.value_hours
                .or(dist.value)
                .unwrap_or(0.0)
        }
        "exponential" => {
            let rate = dist.rate_per_hour.or(dist.rate).unwrap_or(1.0);
            let u: f64 = rng.gen();
            -((1.0 - u).ln()) / rate
        }
        "triangular" => {
            if let (Some(a), Some(m), Some(b)) = (dist.a, dist.m, dist.b) {
                let u: f64 = rng.gen();
                let c = (m - a) / (b - a);
                if u < c {
                    a + (u * (b - a) * (m - a)).sqrt()
                } else {
                    b - ((1.0 - u) * (b - a) * (b - m)).sqrt()
                }
            } else {
                0.0
            }
        }
        "lognormal" => {
            let mu = dist.mu.unwrap_or(0.0);
            let sigma = dist.sigma.unwrap_or(1.0);
            // Box-Muller transform
            let u1: f64 = rng.gen();
            let u2: f64 = rng.gen();
            let z = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
            (mu + sigma * z).exp()
        }
        _ => 0.0,
    }
}

// ============================================================================
// INITIAL RESOURCE DERIVATION
// ============================================================================

fn derive_initial_from_state(state: &State) -> Option<InitialResources> {
    let get_rows = |key: &str| -> Vec<&std::collections::HashMap<String, serde_json::Value>> {
        state
            .tables
            .get(key)
            .and_then(|t| Some(t.rows.iter().collect()))
            .unwrap_or_else(|| Vec::new())
    };

    let aircraft_rows = get_rows("v_aircraft");
    let payload_rows = get_rows("v_payload");
    let staffing_rows = get_rows("v_staffing");
    let unit_rows = get_rows("v_unit");

    // Units list
    let mut units: std::collections::HashSet<String> = unit_rows
        .iter()
        .filter_map(|r| r.get("Unit").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    // FMC aircraft by unit
    let mut aircraft_by_unit: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for r in aircraft_rows {
        if let (Some(status), Some(unit)) = (
            r.get("Status").and_then(|v| v.as_str()),
            r.get("Unit").and_then(|v| v.as_str()),
        ) {
            if status == "FMC" {
                *aircraft_by_unit.entry(unit.to_string()).or_insert(0) += 1;
            }
        }
    }

    // Payload counts by type and unit
    let mut payload_by_unit: std::collections::HashMap<String, std::collections::HashMap<String, u32>> =
        std::collections::HashMap::new();
    for r in payload_rows {
        let unit = r
            .get("Unit")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "UNKNOWN".to_string());
        if let Some(type_val) = r.get("Type").and_then(|v| v.as_str()) {
            payload_by_unit
                .entry(unit.clone())
                .or_insert_with(std::collections::HashMap::new)
                .entry(type_val.to_string())
                .and_modify(|e| *e += 1)
                .or_insert(1);
        }
    }

    // Aircrew by MOS and unit
    let mut crew_by_unit: std::collections::HashMap<String, CrewCounts> =
        std::collections::HashMap::new();
    for r in staffing_rows {
        if let (Some(unit_name), Some(mos)) = (
            r.get("Unit Name").and_then(|v| v.as_str()),
            r.get("MOS Number").and_then(|v| v.as_str()),
        ) {
            let crew = crew_by_unit
                .entry(unit_name.to_string())
                .or_insert_with(|| CrewCounts { pilot: 0, so: 0 });
            if mos == "7318" {
                crew.pilot += 1;
            } else if mos == "7314" {
                crew.so += 1;
            }
        }
    }

    // Ensure all units seen in resources are included
    for unit in aircraft_by_unit.keys() {
        units.insert(unit.clone());
    }
    for unit in payload_by_unit.keys() {
        units.insert(unit.clone());
    }
    for unit in crew_by_unit.keys() {
        units.insert(unit.clone());
    }

    Some(InitialResources {
        units: units.into_iter().collect(),
        aircraft_by_unit,
        crew_by_unit,
        payload_by_unit,
        overrides_applied: false,
    })
}

// ============================================================================
// DEMAND GENERATION
// ============================================================================

#[derive(Debug, Clone)]
struct DemandEvent {
    time: f64,
    event_type: String,
    mission_type: String,
}

fn generate_demand(scenario: &Scenario, rng: &mut impl Rng) -> Vec<DemandEvent> {
    let horizon = scenario.horizon_hours;
    let mut events = Vec::new();

    for d in &scenario.demand {
        let demand_type = d.demand_type.as_deref().unwrap_or("poisson");

        if demand_type == "deterministic" {
            let every = d.every_hours.or(d.interval_hours).unwrap_or(1.0);
            if every <= 0.0 {
                continue;
            }
            let mut t = d.start_at_hours.unwrap_or(0.0);
            while t < horizon {
                events.push(DemandEvent {
                    time: t,
                    event_type: "mission_demand".to_string(),
                    mission_type: d.mission_type.clone(),
                });
                t += every;
            }
        } else {
            // Poisson process
            let rate = d.rate_per_hour.unwrap_or(0.0);
            if rate <= 0.0 {
                continue;
            }
            let mut t = 0.0;
            while t < horizon {
                let dt = sample_dist(
                    &Distribution {
                        dist_type: "exponential".to_string(),
                        rate_per_hour: Some(rate),
                        ..Default::default()
                    },
                    rng,
                );
                t += dt;
                if t <= horizon {
                    events.push(DemandEvent {
                        time: t,
                        event_type: "mission_demand".to_string(),
                        mission_type: d.mission_type.clone(),
                    });
                }
            }
        }
    }

    // Sort events by time
    events.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap());
    events
}

impl Default for Distribution {
    fn default() -> Self {
        Distribution {
            dist_type: "deterministic".to_string(),
            value_hours: None,
            value: None,
            rate_per_hour: None,
            rate: None,
            a: None,
            m: None,
            b: None,
            mu: None,
            sigma: None,
        }
    }
}

// ============================================================================
// MAIN SIMULATION FUNCTION
// ============================================================================

/// Internal DES simulation function that can be called from other Rust crates
/// This is public so Monte Carlo can call it directly without WASM overhead
pub fn run_simulation_internal(scenario: Scenario, options: Options) -> StdResult<Results, String> {
    run_simulation_internal_ref(&scenario, &options)
}

/// Internal DES simulation function that accepts references to avoid cloning
/// This version is used by Monte Carlo to share state across iterations
pub fn run_simulation_internal_ref(scenario: &Scenario, options: &Options) -> StdResult<Results, String> {
    let horizon = scenario.horizon_hours;
    let mut rng = rand::thread_rng();

    // Build mission type map
    let mission_types: std::collections::HashMap<String, MissionType> = scenario
        .mission_types
        .iter()
        .map(|mt| (mt.name.clone(), mt.clone()))
        .collect();

    let process_times = scenario.process_times.as_ref();
    let pre_spec = process_times.and_then(|pt| pt.preflight.as_ref());
    let post_spec = process_times.and_then(|pt| pt.postflight.as_ref());
    let turn_spec = process_times.and_then(|pt| pt.turnaround.as_ref());
    let mount_times = process_times.and_then(|pt| pt.mount_times.as_ref());

    // Initialize resources
    let mut initial = if let Some(ref state) = options.state {
        derive_initial_from_state(state)
            .ok_or_else(|| "Failed to derive initial resources from state".to_string())?
    } else {
        return StdResult::<Results, String>::Err("Simulation requires a valid state snapshot".to_string());
    };

    if initial.units.is_empty() {
        return StdResult::<Results, String>::Err("No units found in state snapshot".to_string());
    }

    // Apply overrides
    if let Some(ref overrides) = options.overrides {
        if let Some(ref units_overrides) = overrides.units {
            // Collect required payload types
            let mut required_payload_types = std::collections::HashSet::new();
            for mt in &scenario.mission_types {
                if let Some(ref payloads) = mt.required_payload_types {
                    for p in payloads {
                        required_payload_types.insert(p.clone());
                    }
                }
            }

            for (unit, o) in units_overrides {
                if !initial.units.contains(unit) {
                    initial.units.push(unit.clone());
                }

                if let Some(ac) = o.aircraft {
                    if ac >= 0.0 {
                        initial
                            .aircraft_by_unit
                            .insert(unit.clone(), ac.floor() as u32);
                    }
                }

                if let Some(pilot) = o.pilot {
                    if pilot >= 0.0 {
                        initial
                            .crew_by_unit
                            .entry(unit.clone())
                            .or_insert_with(|| CrewCounts { pilot: 0, so: 0 })
                            .pilot = pilot.floor() as u32;
                    }
                }

                if let Some(so) = o.so {
                    if so >= 0.0 {
                        initial
                            .crew_by_unit
                            .entry(unit.clone())
                            .or_insert_with(|| CrewCounts { pilot: 0, so: 0 })
                            .so = so.floor() as u32;
                    }
                }

                // Payload overrides
                if let Some(ref payload_by_type) = o.payload_by_type {
                    let unit_payloads = initial
                        .payload_by_unit
                        .entry(unit.clone())
                        .or_insert_with(std::collections::HashMap::new);
                    for (ptype, val) in payload_by_type {
                        if *val >= 0.0 {
                            unit_payloads.insert(ptype.clone(), val.floor() as u32);
                        }
                    }
                }

                if let Some(payload_per_type) = o.payload_per_type {
                    if payload_per_type >= 0.0 {
                        let unit_payloads = initial
                            .payload_by_unit
                            .entry(unit.clone())
                            .or_insert_with(std::collections::HashMap::new);
                        let val = payload_per_type.floor() as u32;
                        // Include existing types and required types
                        let mut types = std::collections::HashSet::new();
                        for t in unit_payloads.keys() {
                            types.insert(t.clone());
                        }
                        for t in &required_payload_types {
                            types.insert(t.clone());
                        }
                        for t in types {
                            unit_payloads.insert(t, val);
                        }
                    }
                }
            }
            initial.overrides_applied = true;
        }
    }

    // Build resource pools per unit
    let mut pools: std::collections::HashMap<String, UnitPools> = std::collections::HashMap::new();
    for unit in &initial.units {
        let ac_total = initial.aircraft_by_unit.get(unit).copied().unwrap_or(0);
        let crew = initial.crew_by_unit.get(unit).cloned().unwrap_or_else(|| CrewCounts {
            pilot: 0,
            so: 0,
        });

        let mut payloads_map = std::collections::HashMap::new();
        if let Some(unit_payloads) = initial.payload_by_unit.get(unit) {
            for (ptype, count) in unit_payloads {
                payloads_map.insert(
                    ptype.clone(),
                    ResourcePool::new(format!("payload:{}:{}", unit, ptype), *count),
                );
            }
        }

        pools.insert(
            unit.clone(),
            UnitPools {
                aircraft: ResourcePool::new(format!("aircraft:{}", unit), ac_total),
                pilot: ResourcePool::new(format!("pilot:{}", unit), crew.pilot),
                so: ResourcePool::new(format!("so:{}", unit), crew.so),
                payloads: payloads_map,
                mission_finishes: Vec::new(),
            },
        );
    }

    // Generate demand events
    let events = generate_demand(&scenario, &mut rng);

    // Initialize results
    let mut results = Results {
        horizon_hours: horizon,
        missions: MissionStats {
            requested: 0,
            started: 0,
            completed: 0,
            rejected: 0,
        },
        rejections: Rejections {
            aircraft: 0,
            pilot: 0,
            so: 0,
            payload: 0,
        },
        utilization: std::collections::HashMap::new(),
        by_type: std::collections::HashMap::new(),
        timeline: Vec::new(),
        initial_resources: initial.clone(),
    };

    // Unit selection helper
    let unit_list: Vec<String> = pools.keys().cloned().collect();
    let mission_split = scenario
        .unit_policy
        .as_ref()
        .and_then(|up| up.mission_split.as_ref())
        .cloned();

    // Process events
    for (i, ev) in events.iter().enumerate() {
        if ev.event_type != "mission_demand" {
            continue;
        }
        if ev.time > horizon {
            break;
        }
        results.missions.requested += 1;

        let mt = match mission_types.get(&ev.mission_type) {
            Some(mt) => mt,
            None => continue,
        };

        // Pick unit for this mission
        let unit = if unit_list.is_empty() {
            continue;
        } else if mission_split.is_none() || mission_split.as_ref().unwrap().is_empty() {
            unit_list[i % unit_list.len()].clone()
        } else {
            // Weighted random selection
            let split = mission_split.as_ref().unwrap();
            let mut cum = Vec::new();
            let mut acc = 0.0;
            for u in &unit_list {
                acc += split.get(u).copied().unwrap_or(0.0);
                cum.push((u.clone(), acc));
            }
            let r: f64 = rng.gen::<f64>() * acc;
            let mut selected = unit_list.last().unwrap().clone();
            for (u, c) in cum {
                if r <= c {
                    selected = u;
                    break;
                }
            }
            selected
        };

        let pool = pools.get_mut(&unit).unwrap();

        // Sample process durations
        let mut mount_time = 0.0;
        if let Some(ref payload_types) = mt.required_payload_types {
            for ptype in payload_types {
                if let Some(mount_times_map) = mount_times {
                    if let Some(spec) = mount_times_map.get(ptype) {
                        mount_time += sample_dist(spec, &mut rng);
                    }
                }
            }
        }

        let pre = pre_spec.map(|s| sample_dist(s, &mut rng)).unwrap_or(0.0);
        let flight = sample_dist(&mt.flight_time, &mut rng);
        let post = post_spec.map(|s| sample_dist(s, &mut rng)).unwrap_or(0.0);
        let turnaround = turn_spec.map(|s| sample_dist(s, &mut rng)).unwrap_or(0.0);

        let duration = pre + mount_time + flight + post + turnaround;

        // Check resource availability
        let need_pilot = mt.required_aircrew.as_ref().and_then(|a| a.pilot).unwrap_or(0);
        let need_so = mt.required_aircrew.as_ref().and_then(|a| a.so).unwrap_or(0);
        let payload_types = mt.required_payload_types.as_ref().cloned().unwrap_or_default();

        // Check payloads first - check all at once to avoid redundant cleanup
        let mut payload_ok = true;
        for ptype in &payload_types {
            let p = pool
                .payloads
                .entry(ptype.clone())
                .or_insert_with(|| ResourcePool::new(format!("payload:{}:{}", unit, ptype), 0));
            if p.available_at(ev.time) < 1 {
                payload_ok = false;
                break;
            }
        }

        if !payload_ok {
            results.missions.rejected += 1;
            results.rejections.payload += 1;
            let bt = results
                .by_type
                .entry(mt.name.clone())
                .or_insert_with(|| MissionStats {
                    requested: 0,
                    started: 0,
                    completed: 0,
                    rejected: 0,
                });
            bt.requested += 1;
            bt.rejected += 1;
            results.timeline.push(TimelineEvent::Rejection {
                time: ev.time,
                unit: unit.clone(),
                mission_type: mt.name.clone(),
                reason: "payload".to_string(),
            });
            continue;
        }

        if pool.aircraft.available_at(ev.time) < 1 {
            results.missions.rejected += 1;
            results.rejections.aircraft += 1;
            let bt = results
                .by_type
                .entry(mt.name.clone())
                .or_insert_with(|| MissionStats {
                    requested: 0,
                    started: 0,
                    completed: 0,
                    rejected: 0,
                });
            bt.requested += 1;
            bt.rejected += 1;
            results.timeline.push(TimelineEvent::Rejection {
                time: ev.time,
                unit: unit.clone(),
                mission_type: mt.name.clone(),
                reason: "aircraft".to_string(),
            });
            continue;
        }

        if need_pilot > 0 && pool.pilot.available_at(ev.time) < need_pilot {
            results.missions.rejected += 1;
            results.rejections.pilot += 1;
            let bt = results
                .by_type
                .entry(mt.name.clone())
                .or_insert_with(|| MissionStats {
                    requested: 0,
                    started: 0,
                    completed: 0,
                    rejected: 0,
                });
            bt.requested += 1;
            bt.rejected += 1;
            results.timeline.push(TimelineEvent::Rejection {
                time: ev.time,
                unit: unit.clone(),
                mission_type: mt.name.clone(),
                reason: "pilot".to_string(),
            });
            continue;
        }

        if need_so > 0 && pool.so.available_at(ev.time) < need_so {
            results.missions.rejected += 1;
            results.rejections.so += 1;
            let bt = results
                .by_type
                .entry(mt.name.clone())
                .or_insert_with(|| MissionStats {
                    requested: 0,
                    started: 0,
                    completed: 0,
                    rejected: 0,
                });
            bt.requested += 1;
            bt.rejected += 1;
            results.timeline.push(TimelineEvent::Rejection {
                time: ev.time,
                unit: unit.clone(),
                mission_type: mt.name.clone(),
                reason: "so".to_string(),
            });
            continue;
        }

        // All resources available - acquire them all
        // Note: try_acquire will check availability again, but that's fine since
        // we've already verified all resources are available
        for ptype in &payload_types {
            let acquired = pool.payloads
                .get_mut(ptype)
                .unwrap()
                .try_acquire(ev.time, duration, 1);
            // This should always succeed since we checked above, but handle gracefully
            if !acquired {
                // This shouldn't happen, but if it does, reject the mission
                results.missions.rejected += 1;
                results.rejections.payload += 1;
                continue;
            }
        }
        if !pool.aircraft.try_acquire(ev.time, duration, 1) {
            results.missions.rejected += 1;
            results.rejections.aircraft += 1;
            continue;
        }
        if need_pilot > 0 && !pool.pilot.try_acquire(ev.time, duration, need_pilot) {
            results.missions.rejected += 1;
            results.rejections.pilot += 1;
            continue;
        }
        if need_so > 0 && !pool.so.try_acquire(ev.time, duration, need_so) {
            results.missions.rejected += 1;
            results.rejections.so += 1;
            continue;
        }

        pool.mission_finishes.push(ev.time + duration);

        results.missions.started += 1;
        let bt = results
            .by_type
            .entry(mt.name.clone())
            .or_insert_with(|| MissionStats {
                requested: 0,
                started: 0,
                completed: 0,
                rejected: 0,
            });
        bt.requested += 1;
        bt.started += 1;

        // Record timeline
        let t0 = ev.time;
        let t1 = t0 + pre;
        let t2 = t1 + mount_time;
        let t3 = t2 + flight;
        let t4 = t3 + post;
        let t5 = t4 + turnaround;

        results.timeline.push(TimelineEvent::Mission {
            unit: unit.clone(),
            mission_type: mt.name.clone(),
            demand_time: t0,
            finish_time: t5,
            segments: vec![
                TimelineSegment {
                    name: "preflight".to_string(),
                    start: t0,
                    end: t1,
                },
                TimelineSegment {
                    name: "mount".to_string(),
                    start: t1,
                    end: t2,
                },
                TimelineSegment {
                    name: "flight".to_string(),
                    start: t2,
                    end: t3,
                },
                TimelineSegment {
                    name: "postflight".to_string(),
                    start: t3,
                    end: t4,
                },
                TimelineSegment {
                    name: "turnaround".to_string(),
                    start: t4,
                    end: t5,
                },
            ],
        });
    }

    // Calculate statistics
    for unit in &unit_list {
        let pool = pools.get(unit).unwrap();
        let completed = pool
            .mission_finishes
            .iter()
            .filter(|&&t| t <= horizon)
            .count();
        results.missions.completed += completed as u32;
    }

    // Per-mission-type completion counts
    for item in &results.timeline {
        if let TimelineEvent::Mission {
            finish_time,
            mission_type,
            ..
        } = item
        {
            if *finish_time <= horizon {
                let bt = results
                    .by_type
                    .entry(mission_type.clone())
                    .or_insert_with(|| MissionStats {
                        requested: 0,
                        started: 0,
                        completed: 0,
                        rejected: 0,
                    });
                bt.completed += 1;
            }
        }
    }

    // Utilization per unit
    for unit in &unit_list {
        let pool = pools.get(unit).unwrap();
        results.utilization.insert(
            unit.clone(),
            Utilization {
                aircraft: (pool.aircraft.utilization(horizon) * 1000.0).round() / 1000.0,
                pilot: (pool.pilot.utilization(horizon) * 1000.0).round() / 1000.0,
                so: (pool.so.utilization(horizon) * 1000.0).round() / 1000.0,
            },
        );
    }

    Ok(results)
}

// ============================================================================
// N-API BINDINGS
// ============================================================================

#[napi]
pub fn run_simulation(scenario: serde_json::Value, options: serde_json::Value) -> napi::Result<serde_json::Value> {
    // Deserialize inputs
    let scenario: Scenario = serde_json::from_value(scenario)
        .map_err(|e| napi::Error::from_reason(format!("Failed to parse scenario: {}", e)))?;
    
    let options: Options = serde_json::from_value(options)
        .map_err(|e| napi::Error::from_reason(format!("Failed to parse options: {}", e)))?;

    // Run simulation
    let results = run_simulation_internal(scenario, options)
        .map_err(|e| napi::Error::from_reason(format!("Simulation error: {}", e)))?;

    // Serialize output
    serde_json::to_value(&results)
        .map_err(|e| napi::Error::from_reason(format!("Failed to serialize results: {}", e)))
}
