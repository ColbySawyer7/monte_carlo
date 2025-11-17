/**
 * DISCRETE EVENT SIMULATION (DES) ENGINE
 * 
 * This engine implements a simplified DES approach for modeling aircraft mission operations.
 * 
 * DES FUNDAMENTALS:
 * - Events occur at discrete points in time (mission demands, resource releases)
 * - The simulation advances by processing events in chronological order
 * - Resources (aircraft, crew, payloads) are held for durations and released at future times
 * - No continuous time tracking needed - we only care about event times
 * 
 * KEY DESIGN DECISIONS:
 * - Uses a minimal event list: only mission demand events are pre-generated
 * - Resource releases are implicit (stored as release times in resource pools)
 * - No explicit event queue for resource releases - we check availability at demand time
 * - Derives initial resource counts from a provided state snapshot (no DB queries)
 * 
 * SIMULATION FLOW:
 * 1. Generate all mission demand events upfront (sorted by time)
 * 2. For each demand event, check resource availability at that time
 * 3. If available, acquire resources and record release times
 * 4. Track statistics (utilization, rejections, completions)
 * 
 * TODO complete review of this file
 */

/**
 * Samples a random value from a probability distribution.
 * 
 * This is critical for DES because process times (preflight, flight, etc.) are stochastic.
 * Each time we need a duration, we sample from the specified distribution to model variability.
 * 
 * @param {Object} spec - Distribution specification with 'type' and parameters
 * @returns {number} - Sampled duration in hours
 */
function sampleDist(spec) {
  if (!spec) return 0;
  const t = spec.type || 'deterministic';
  
  // Deterministic: fixed value (no randomness)
  // Used for scenarios where we want exact, repeatable durations
  if (t === 'deterministic') {
    if (typeof spec.value_hours === 'number') return spec.value_hours;
    if (typeof spec.value === 'number') return spec.value; // allow generic
    return 0;
  }
  
  // Exponential: models time between events in Poisson processes
  // Also used for service times in queueing theory
  // PDF: f(t) = λ * e^(-λt), where λ is the rate parameter
  // Inverse CDF method: t = -ln(1-U)/λ where U ~ Uniform(0,1)
  if (t === 'exponential') {
    const rate = spec.rate_per_hour || spec.rate || 1; // lambda (rate parameter)
    const u = Math.random(); // Uniform(0,1) random variate
    return -Math.log(1 - u) / rate; // hours
  }
  
  // Triangular: bounded distribution with mode (most likely value)
  // Parameters: a (min), m (mode/most likely), b (max)
  // Useful for modeling durations where we know min, max, and most likely values
  if (t === 'triangular') {
    const { a, m, b } = spec; // hours
    const u = Math.random();
    const c = (m - a) / (b - a); // Cumulative probability at mode
    // Inverse CDF: different formula for each side of the mode
    if (u < c) return a + Math.sqrt(u * (b - a) * (m - a));
    return b - Math.sqrt((1 - u) * (b - a) * (b - m));
  }
  
  // Lognormal: log of the value is normally distributed
  // Useful for modeling durations that are always positive and have long tails
  // Parameters: mu (mean of log), sigma (std dev of log)
  // Box-Muller transform generates standard normal, then transform to lognormal
  if (t === 'lognormal') {
    const mu = spec.mu || 0; // in log-hours (mean of the underlying normal)
    const sigma = spec.sigma || 1; // std dev of the underlying normal
    // Box-Muller: generates two independent standard normal variates
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); // Standard normal
    return Math.exp(mu + sigma * z); // Transform to lognormal
  }
  return 0;
}

/**
 * RESOURCE POOL - Core DES Resource Management
 * 
 * This class manages a pool of identical resources (e.g., aircraft, pilots, payloads).
 * In DES, resources are held for durations and released at future times.
 * 
 * KEY INSIGHT: We don't track which specific resource is held - we only care about
 * how many are available at any given time. This is the "pool" abstraction.
 * 
 * IMPLEMENTATION DETAILS:
 * - 'held' array stores release times (not resource IDs)
 * - At any time T, resources with release_time <= T are available
 * - This avoids needing an explicit event queue for resource releases
 * - We clean up expired release times lazily when checking availability
 */
class ResourcePool {
  constructor(name, total) {
    this.name = name;
    this.total = total; // Total number of resources in the pool
    // CRITICAL: This array stores release times, not resource IDs
    // Example: if we hold 2 resources until time 10.5, held = [10.5, 10.5]
    this.held = []; // array of release times
    this.busyTime = 0; // aggregate busy time used for utilization estimate
    this.allocations = 0; // Total successful allocations (for statistics)
    this.denials = 0; // Total denied requests (for statistics)
  }
  
  /**
   * Check how many resources are available at a given simulation time.
   * 
   * DES TECHNIQUE: Lazy cleanup of expired release times
   * - We filter out release times that have passed (t <= time)
   * - Remaining entries represent resources still in use
   * - Available = total - currently_held
   * 
   * @param {number} time - Current simulation time in hours
   * @returns {number} - Number of available resources
   */
  availableAt(time) {
    // Remove resources that have been released (release_time <= current_time)
    // This is the "lazy cleanup" - we don't need explicit release events
    this.held = this.held.filter(t => t > time);
    return this.total - this.held.length;
  }
  
  /**
   * Attempt to acquire resources at a given time for a given duration.
   * 
   * DES RESOURCE ACQUISITION:
   * - Check availability first
   * - If available, record release time (current_time + duration)
   * - Resources are implicitly released at that future time
   * - No explicit "release" event needed - we check release times when needed
   * 
   * @param {number} time - Current simulation time
   * @param {number} durationHours - How long resources will be held
   * @param {number} count - Number of resources to acquire (default: 1)
   * @returns {boolean} - True if acquisition succeeded, false if denied
   */
  tryAcquire(time, durationHours, count = 1) {
    const avail = this.availableAt(time);
    if (avail >= count) {
      // Acquire resources: record when they'll be released
      // Each resource gets a release time = current_time + duration
      for (let i = 0; i < count; i++) {
        this.held.push(time + durationHours);
      }
      this.allocations += count;
      // Track busy time for utilization calculation
      // If we hold 'count' resources for 'durationHours', that's count * durationHours busy-time
      this.busyTime += durationHours * count;
      return true;
    }
    // Insufficient resources available - record denial
    this.denials += count;
    return false;
  }
  
  /**
   * Calculate resource utilization over the simulation horizon.
   * 
   * UTILIZATION = (Total busy time) / (Total capacity time)
   * 
   * Example: If we have 2 aircraft and hold them for 10 hours total over a 24-hour period:
   * - Total capacity = 2 aircraft * 24 hours = 48 aircraft-hours
   * - Busy time = 10 aircraft-hours
   * - Utilization = 10/48 = 0.208 (20.8%)
   * 
   * @param {number} horizonHours - Total simulation time horizon
   * @returns {number} - Utilization ratio (0 to 1)
   */
  utilization(horizonHours) {
    if (this.total <= 0 || horizonHours <= 0) return 0;
    // Utilization is capped at 1.0 (100%) - can't exceed capacity
    return Math.min(1, this.busyTime / (this.total * horizonHours));
  }
}

/**
 * Derives initial resource counts from a state snapshot.
 * 
 * DES INITIALIZATION:
 * - The simulation needs starting resource counts (aircraft, crew, payloads)
 * - This function extracts these from database view snapshots
 * - Only counts resources that are available (e.g., FMC aircraft)
 * - Groups resources by unit for multi-unit simulations
 * 
 * @param {Object} state - State snapshot with tables containing resource data
 * @returns {Object|null} - Initial resource configuration or null if invalid
 */
function deriveInitialFromState(state) {
  if (!state || !state.tables) return null;

  function getRows(key) {
    const t = state.tables[key];
    return t && Array.isArray(t.rows) ? t.rows : [];
  }

  // Extract data from database views
  const aircraftRows = getRows('v_aircraft');
  const payloadRows = getRows('v_payload');
  const staffingRows = getRows('v_staffing');
  const unitRows = getRows('v_unit');

  // Units list (prefer v_unit names)
  // Units are the organizational entities that own resources
  const units = Array.from(new Set(
    unitRows.map(r => r['Unit']).filter(Boolean)
  ));

  // FMC aircraft by unit
  // Only count "Fully Mission Capable" aircraft as available resources
  const aircraftByUnit = {};
  for (const r of aircraftRows) {
    const status = r['Status'];
    const unit = r['Unit'];
    if (status === 'FMC' && unit) {
      aircraftByUnit[unit] = (aircraftByUnit[unit] || 0) + 1;
    }
  }

  // Payload counts by type and unit
  // Payloads are equipment that must be mounted on aircraft for missions
  // Different mission types require different payload types
  const payloadByUnit = {};
  for (const r of payloadRows) {
    const unit = r['Unit'] || 'UNKNOWN';
    const type = r['Type'];
    if (!type) continue;
    if (!payloadByUnit[unit]) payloadByUnit[unit] = {};
    payloadByUnit[unit][type] = (payloadByUnit[unit][type] || 0) + 1;
  }

  // Aircrew by MOS and unit (pilot 7318, SO 7314) from v_staffing
  // MOS = Military Occupational Specialty
  // 7318 = Pilot, 7314 = Sensor Operator (SO)
  const crewByUnit = {};
  for (const r of staffingRows) {
    const unitName = r['Unit Name'];
    const mos = r['MOS Number'];
    if (!unitName || !mos) continue;
    if (!crewByUnit[unitName]) crewByUnit[unitName] = { pilot: 0, so: 0 };
    if (mos === '7318') crewByUnit[unitName].pilot += 1;
    if (mos === '7314') crewByUnit[unitName].so += 1;
  }

  // Ensure all units seen in resources are included
  // A unit might have resources but not be in v_unit, so we include it
  const allUnits = new Set(units);
  Object.keys(aircraftByUnit).forEach(u => allUnits.add(u));
  Object.keys(payloadByUnit).forEach(u => allUnits.add(u));
  Object.keys(crewByUnit).forEach(u => allUnits.add(u));

  return {
    units: Array.from(allUnits),
    aircraftByUnit,
    payloadByUnit,
    crewByUnit,
  };
}

/**
 * Builds a lookup map for mission type definitions.
 * 
 * Mission types define requirements (crew, payloads, flight time) for each mission.
 * This map allows O(1) lookup during event processing.
 * 
 * @param {Object} scenario - Scenario configuration with mission_types array
 * @returns {Map} - Map from mission type name to mission type definition
 */
function buildMissionMap(scenario) {
  const map = new Map();
  for (const mt of scenario.mission_types) {
    map.set(mt.name, mt);
  }
  return map;
}

/**
 * GENERATE DEMAND EVENTS - Core DES Event Generation
 * 
 * This function pre-generates all mission demand events for the simulation.
 * This is a key DES technique: generate all events upfront, then process chronologically.
 * 
 * DEMAND GENERATION STRATEGIES:
 * 1. Deterministic: Fixed intervals (e.g., every 2 hours)
 * 2. Poisson: Random arrivals following exponential inter-arrival times
 * 
 * POISSON PROCESS THEORY:
 * - A Poisson process models random arrivals over time
 * - Rate parameter λ (lambda) = average arrivals per unit time
 * - Inter-arrival times follow Exponential(λ) distribution
 * - Mean inter-arrival time = 1/λ hours
 * - Example: λ=2.5 missions/hour means average 0.4 hours (24 min) between missions
 * 
 * @param {Object} scenario - Scenario configuration with demand specifications
 * @returns {Array} - Sorted array of demand events {time, type, mission_type}
 */
function generateDemand(scenario) {
  const horizon = scenario.horizon_hours;
  const events = [];
  const demandList = scenario.demand || [];
  
  for (const d of demandList) {
    const typ = d.type || 'poisson';
    
    // Deterministic demand: fixed intervals
    // Useful for scheduled operations or testing
    if (typ === 'deterministic') {
      const every = d.every_hours || d.interval_hours || 1;
      if (every <= 0) continue;
      let t = (d.start_at_hours != null) ? d.start_at_hours : 0;
      // Place demands at fixed intervals, including t=0 if specified.
      // Upper bound is exclusive: do NOT schedule at t == horizon.
      while (t < horizon) {
        events.push({ time: t, type: 'mission_demand', mission_type: d.mission_type });
        t += every;
      }
    } else {
      // Poisson demand process: missions arrive randomly over time
      // This models realistic, unpredictable mission arrivals
      // rate_per_hour (λ) = average number of missions expected per hour
      // Example: rate=2.5 means we expect 2.5 missions per hour on average (60 missions over 24 hours)
      const rate = d.rate_per_hour || 0;
      if (rate <= 0) continue;
      let t = 0;
      
      // Generate demands using exponential inter-demand times
      // For a Poisson process with rate λ, time between demands follows Exponential(λ)
      // Formula: dt = -ln(1-u)/λ where u ~ Uniform(0,1)
      // This produces random intervals that average to 1/λ hours between demands
      // 
      // ALGORITHM: Start at t=0, repeatedly:
      //   1. Sample inter-arrival time dt from Exponential(λ)
      //   2. Advance time: t = t + dt
      //   3. If t <= horizon, create demand event at time t
      //   4. Repeat until t >= horizon
      while (t < horizon) {
        const dt = sampleDist({ type: 'exponential', rate_per_hour: rate });
        t += dt; // Advance to next demand time
        if (t <= horizon) {
          events.push({ time: t, type: 'mission_demand', mission_type: d.mission_type });
        }
      }
    }
  }
  
  // CRITICAL: Sort events by time for chronological processing
  // DES requires events to be processed in time order
  events.sort((a, b) => a.time - b.time);
  return events;
}

/**
 * MAIN SIMULATION FUNCTION - Core DES Algorithm
 * 
 * This function implements the discrete event simulation loop:
 * 1. Initialize resources from state snapshot
 * 2. Generate all demand events upfront
 * 3. Process events chronologically
 * 4. For each demand: check resources, acquire if available, record timeline
 * 5. Calculate statistics (utilization, completions, rejections)
 * 
 * KEY DES CONCEPT: We process events in time order, but we don't simulate
 * continuous time. We jump from event to event, checking resource availability
 * at each event time.
 * 
 * @param {Object} scenario - Scenario configuration (demand, mission types, process times)
 * @param {Object} options - Options including state snapshot and resource overrides
 * @returns {Object} - Simulation results with statistics and timeline
 */
async function runSimulation(scenario, options = {}) {
  const horizon = scenario.horizon_hours || 24; // Simulation time horizon
  const missionTypes = buildMissionMap(scenario); // O(1) lookup for mission requirements
  const preSpec = scenario.process_times?.preflight; // Preflight duration distribution
  const postSpec = scenario.process_times?.postflight; // Postflight duration distribution
  const turnSpec = scenario.process_times?.turnaround; // Turnaround duration distribution

  // ========================================================================
  // STEP 1: INITIALIZE RESOURCES
  // ========================================================================
  // Load initial resources from state snapshot (database views)
  let initial;
  if (options.state) {
    initial = deriveInitialFromState(options.state);
  }
  if (!initial || !initial.units || initial.units.length === 0) {
    throw new Error('Simulation requires a valid state snapshot with tables: v_aircraft, v_payload, v_staffing, v_unit');
  }

  // Apply overrides (replace derived counts) if provided
  // Overrides allow testing "what-if" scenarios (e.g., "what if we had 10 aircraft?")
  const overrides = options.overrides && options.overrides.units ? options.overrides.units : null;
  if (overrides) {
    // Collect all payload types required by scenario to ensure pools exist when overridden
    // This ensures we create pools for payload types that missions need, even if not in state
    const requiredPayloadTypes = new Set();
    for (const mt of scenario.mission_types || []) {
      (mt.required_payload_types || []).forEach(p => requiredPayloadTypes.add(p));
    }
    for (const [unit, o] of Object.entries(overrides)) {
      if (!initial.units.includes(unit)) initial.units.push(unit);
      if (o && typeof o === 'object') {
        if (Number.isFinite(o.aircraft)) initial.aircraftByUnit[unit] = Math.max(0, Math.floor(o.aircraft));
        // Ensure crew object exists
        if (!initial.crewByUnit[unit]) initial.crewByUnit[unit] = { pilot: 0, so: 0 };
        if (Number.isFinite(o.pilot)) initial.crewByUnit[unit].pilot = Math.max(0, Math.floor(o.pilot));
        if (Number.isFinite(o.so)) initial.crewByUnit[unit].so = Math.max(0, Math.floor(o.so));
        // Payload overrides
        // 1) Per-type mapping (preferred): payload_by_type = { 'SkyTower II': 6, ... }
        if (o.payload_by_type && typeof o.payload_by_type === 'object') {
          if (!initial.payloadByUnit[unit]) initial.payloadByUnit[unit] = {};
          for (const [ptype, valRaw] of Object.entries(o.payload_by_type)) {
            const val = Number.isFinite(valRaw) ? Math.max(0, Math.floor(valRaw)) : 0;
            initial.payloadByUnit[unit][ptype] = val;
          }
        }
        // 2) Backward compat: uniform count per type (applies to existing and required types)
        if (Number.isFinite(o.payload_per_type)) {
          const val = Math.max(0, Math.floor(o.payload_per_type));
          if (!initial.payloadByUnit[unit]) initial.payloadByUnit[unit] = {};
          // Include existing types and those required by scenario
          const types = new Set([...Object.keys(initial.payloadByUnit[unit] || {}), ...requiredPayloadTypes]);
          for (const t of types) {
            initial.payloadByUnit[unit][t] = val;
          }
        }
      }
    }
  }

  // Build resource pools per unit
  // Each unit has its own pools for aircraft, crew, and payloads
  // This allows multi-unit simulations where units operate independently
  const pools = {};
  for (const unit of initial.units) {
    const acTotal = initial.aircraftByUnit[unit] || 0;
    const crew = initial.crewByUnit[unit] || { pilot: 0, so: 0 };
    pools[unit] = {
      aircraft: new ResourcePool(`aircraft:${unit}`, acTotal),
      pilot: new ResourcePool(`pilot:${unit}`, crew.pilot || 0),
      so: new ResourcePool(`so:${unit}`, crew.so || 0),
      payloads: {}, // Payload pools are per-type (different payload types are different resources)
      missionFinishes: [], // Track when missions finish (for completion statistics)
    };
    const payloads = initial.payloadByUnit[unit] || {};
    for (const [ptype, count] of Object.entries(payloads)) {
      pools[unit].payloads[ptype] = new ResourcePool(`payload:${unit}:${ptype}`, count || 0);
    }
  }

  // ========================================================================
  // STEP 2: GENERATE DEMAND EVENTS
  // ========================================================================
  // Pre-generate all mission demand events (sorted by time)
  // This is a key DES technique: generate all events upfront, then process in order
  const events = generateDemand(scenario);
  
  // Initialize results structure for statistics collection
  const results = {
    horizon_hours: horizon,
    missions: { requested: 0, started: 0, completed: 0, rejected: 0 },
    rejections: { aircraft: 0, pilot: 0, so: 0, payload: 0 }, // Track rejection reasons
    utilization: {}, // Resource utilization per unit
    by_type: {}, // Statistics broken down by mission type
    timeline: [], // detailed events for Gantt-like visualization
    initial_resources: {
      units: initial.units.slice(),
      aircraftByUnit: initial.aircraftByUnit,
      crewByUnit: initial.crewByUnit,
      payloadByUnit: initial.payloadByUnit,
      overrides_applied: Boolean(overrides)
    }
  };

  // Helper to select unit based on mission_split policy
  // This determines which unit handles each mission demand
  const split = scenario.unit_policy?.mission_split || {};
  const unitList = Object.keys(pools);
  function pickUnit(idx) {
    // Simple round-robin weighted by split ratios
    // If no split policy, use round-robin
    if (!unitList.length) return null;
    if (!Object.keys(split).length) return unitList[idx % unitList.length];
    // Weighted random selection based on split ratios
    // Build cumulative distribution for weighted selection
    const cum = [];
    let acc = 0;
    for (const u of unitList) {
      acc += split[u] || 0;
      cum.push([u, acc]);
    }
    const r = Math.random() * acc;
    for (const [u, c] of cum) if (r <= c) return u;
    return unitList[unitList.length - 1];
  }

  // ========================================================================
  // STEP 3: PROCESS EVENTS - CORE DES LOOP
  // ========================================================================
  // This is the heart of the DES algorithm: process events in chronological order
  // For each demand event:
  //   1. Check resource availability at event time
  //   2. Sample process durations (stochastic)
  //   3. If resources available, acquire them and record timeline
  //   4. If not available, record rejection with reason
  //
  // KEY INSIGHT: We don't simulate continuous time. We jump from event to event,
  // checking resource state at each event time. Resource releases are implicit
  // (stored as release times in pools).
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type !== 'mission_demand') continue;
    if (ev.time > horizon) break; // Stop processing events beyond horizon
    results.missions.requested++;
    
    // Look up mission type requirements
    const mt = missionTypes.get(ev.mission_type);
    if (!mt) continue;
    
    // Select which unit will handle this mission
    const unit = pickUnit(i);
    if (!unit) continue;
    const pool = pools[unit];

    // ========================================================================
    // SAMPLE PROCESS DURATIONS (STOCHASTIC MODELING)
    // ========================================================================
    // Each mission has multiple phases with stochastic durations
    // We sample from probability distributions to model variability
    
    // Determine total mount time for required payloads (sum of per-payload process)
    // Each payload type may have different mount times
    let mountTime = 0;
    for (const ptype of mt.required_payload_types || []) {
      const spec = scenario.process_times?.mount_times?.[ptype];
      mountTime += sampleDist(spec);
    }
    
    // Sample per-mission phase times from their distributions
    const pre = sampleDist(preSpec); // Preflight preparation time
    const flight = sampleDist(mt.flight_time); // Actual flight duration (mission-specific)
    const post = sampleDist(postSpec); // Postflight processing time
    const turnaround = sampleDist(turnSpec); // Turnaround time before next mission
    
    // Total mission duration = sum of all phases
    const duration = pre + mountTime + flight + post + turnaround;

    // ========================================================================
    // RESOURCE AVAILABILITY CHECK
    // ========================================================================
    // Check if all required resources are available at the demand time
    // Order matters: we check payloads first to provide granular rejection reasons
    
    const needPilot = mt.required_aircrew?.pilot || 0;
    const needSO = mt.required_aircrew?.so || 0;
    const payloadTypes = mt.required_payload_types || [];

    // Check payload availability first (to produce granular rejection reason)
    // Each required payload type must have at least 1 available
    let payloadOk = true;
    for (const ptype of payloadTypes) {
      // If payload pool doesn't exist, create empty pool (will always fail)
      const p = pool.payloads[ptype] || new ResourcePool(`payload:${unit}:${ptype}`, 0);
      if (p.availableAt(ev.time) < 1) { payloadOk = false; break; }
    }

    // REJECTION HANDLING: If any resource unavailable, reject mission
    // We track rejection reasons separately to identify bottlenecks
    if (!payloadOk) {
      results.missions.rejected++;
      results.rejections.payload++;
      results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: 'payload' });
      continue; // Move to next event
    }

    if (pool.aircraft.availableAt(ev.time) < 1) {
      results.missions.rejected++;
      results.rejections.aircraft++;
      const btR = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
      btR.requested = (btR.requested || 0) + 1;
      btR.rejected = (btR.rejected || 0) + 1;
      results.by_type[mt.name] = btR;
      results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: 'aircraft' });
      continue;
    }
    if (needPilot && pool.pilot.availableAt(ev.time) < needPilot) {
      results.missions.rejected++;
      results.rejections.pilot++;
      const btR = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
      btR.requested = (btR.requested || 0) + 1;
      btR.rejected = (btR.rejected || 0) + 1;
      results.by_type[mt.name] = btR;
      results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: 'pilot' });
      continue;
    }
    if (needSO && pool.so.availableAt(ev.time) < needSO) {
      results.missions.rejected++;
      results.rejections.so++;
      const btR = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
      btR.requested = (btR.requested || 0) + 1;
      btR.rejected = (btR.rejected || 0) + 1;
      results.by_type[mt.name] = btR;
      results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: 'so' });
      continue;
    }

    // ========================================================================
    // RESOURCE ACQUISITION (ALL RESOURCES AVAILABLE)
    // ========================================================================
    // All required resources are available - acquire them
    // Resources will be implicitly released at (current_time + duration)
    // No explicit release event needed - we check release times when needed
    
    for (const ptype of payloadTypes) {
      pool.payloads[ptype].tryAcquire(ev.time, duration, 1);
    }
    pool.aircraft.tryAcquire(ev.time, duration, 1);
    if (needPilot) pool.pilot.tryAcquire(ev.time, duration, needPilot);
    if (needSO) pool.so.tryAcquire(ev.time, duration, needSO);
    
    // Record mission finish time for completion statistics
    pool.missionFinishes.push(ev.time + duration);

    // Update statistics
    results.missions.started++;
    const bt = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
    bt.requested = (bt.requested || 0) + 1;
    bt.started = (bt.started || 0) + 1;
    results.by_type[mt.name] = bt;

    // ========================================================================
    // RECORD DETAILED TIMELINE (FOR VISUALIZATION)
    // ========================================================================
    // Create detailed timeline entry showing all mission phases
    // This enables Gantt chart-style visualizations
    const t0 = ev.time; // Demand arrival time
    const t1 = t0 + pre; // End of preflight
    const t2 = t1 + mountTime; // End of payload mounting
    const t3 = t2 + flight; // End of flight
    const t4 = t3 + post; // End of postflight
    const t5 = t4 + turnaround; // End of turnaround (mission complete)
    results.timeline.push({
      type: 'mission',
      unit,
      mission_type: mt.name,
      demand_time: t0,
      finish_time: t5,
      segments: [
        { name: 'preflight', start: t0, end: t1 },
        { name: 'mount', start: t1, end: t2 },
        { name: 'flight', start: t2, end: t3 },
        { name: 'postflight', start: t3, end: t4 },
        { name: 'turnaround', start: t4, end: t5 },
      ]
    });
  }

  // ========================================================================
  // STEP 4: CALCULATE STATISTICS
  // ========================================================================
  // After processing all events, calculate final statistics
  
  // Completed missions: count finish times within horizon (overall)
  // A mission is "completed" if it finishes before the simulation horizon ends
  // Note: Missions that start but finish after horizon are "started" but not "completed"
  for (const unit of unitList) {
    const pool = pools[unit];
    const completed = pool.missionFinishes.filter(t => t <= horizon).length;
    results.missions.completed += completed;
  }

  // Per-mission-type completion counts (using timeline finish times)
  // This provides granular statistics broken down by mission type
  for (const item of results.timeline) {
    if (item.type === 'mission' && item.finish_time <= horizon) {
      const btC = results.by_type[item.mission_type] || { requested: 0, started: 0, completed: 0, rejected: 0 };
      btC.completed = (btC.completed || 0) + 1;
      results.by_type[item.mission_type] = btC;
    }
  }

  // Utilization per unit
  // Utilization = (Total busy time) / (Total capacity time)
  // This tells us how heavily utilized each resource type is
  // High utilization (>0.8) may indicate resource bottlenecks
  for (const unit of unitList) {
    const pool = pools[unit];
    results.utilization[unit] = {
      aircraft: Number(pool.aircraft.utilization(horizon).toFixed(3)),
      pilot: Number(pool.pilot.utilization(horizon).toFixed(3)),
      so: Number(pool.so.utilization(horizon).toFixed(3)),
    };
  }

  return results;
}

module.exports = { runSimulation, deriveInitialFromState };
