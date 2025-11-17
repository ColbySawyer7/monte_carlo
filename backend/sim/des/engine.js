// Simple DES Engine 
// - Uses a minimal event list and resource pools
// - Derives initial resource counts from a provided state snapshot (no DB queries)
// TODO complete review of this file
function sampleDist(spec) {
  if (!spec) return 0;
  const t = spec.type || 'deterministic';
  if (t === 'deterministic') {
    if (typeof spec.value_hours === 'number') return spec.value_hours;
    if (typeof spec.value === 'number') return spec.value; // allow generic
    return 0;
  }
  if (t === 'exponential') {
    const rate = spec.rate_per_hour || spec.rate || 1; // lambda
    const u = Math.random();
    return -Math.log(1 - u) / rate; // hours
  }
  if (t === 'triangular') {
    const { a, m, b } = spec; // hours
    const u = Math.random();
    const c = (m - a) / (b - a);
    if (u < c) return a + Math.sqrt(u * (b - a) * (m - a));
    return b - Math.sqrt((1 - u) * (b - a) * (b - m));
  }
  if (t === 'lognormal') {
    const mu = spec.mu || 0; // in log-hours
    const sigma = spec.sigma || 1;
    // Box-Muller
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(mu + sigma * z);
  }
  return 0;
}

class ResourcePool {
  constructor(name, total) {
    this.name = name;
    this.total = total;
    this.held = []; // array of release times
    this.busyTime = 0; // aggregate busy time used for utilization estimate
    this.allocations = 0;
    this.denials = 0;
  }
  availableAt(time) {
    // remove released
    this.held = this.held.filter(t => t > time);
    return this.total - this.held.length;
  }
  tryAcquire(time, durationHours, count = 1) {
    const avail = this.availableAt(time);
    if (avail >= count) {
      for (let i = 0; i < count; i++) {
        this.held.push(time + durationHours);
      }
      this.allocations += count;
      this.busyTime += durationHours * count;
      return true;
    }
    this.denials += count;
    return false;
  }
  utilization(horizonHours) {
    if (this.total <= 0 || horizonHours <= 0) return 0;
    return Math.min(1, this.busyTime / (this.total * horizonHours));
  }
}

function deriveInitialFromState(state) {
  if (!state || !state.tables) return null;

  function getRows(key) {
    const t = state.tables[key];
    return t && Array.isArray(t.rows) ? t.rows : [];
  }

  const aircraftRows = getRows('v_aircraft');
  const payloadRows = getRows('v_payload');
  const staffingRows = getRows('v_staffing');
  const unitRows = getRows('v_unit');

  // Units list (prefer v_unit names)
  const units = Array.from(new Set(
    unitRows.map(r => r['Unit']).filter(Boolean)
  ));

  // FMC aircraft by unit
  const aircraftByUnit = {};
  for (const r of aircraftRows) {
    const status = r['Status'];
    const unit = r['Unit'];
    if (status === 'FMC' && unit) {
      aircraftByUnit[unit] = (aircraftByUnit[unit] || 0) + 1;
    }
  }

  // Payload counts by type and unit
  const payloadByUnit = {};
  for (const r of payloadRows) {
    const unit = r['Unit'] || 'UNKNOWN';
    const type = r['Type'];
    if (!type) continue;
    if (!payloadByUnit[unit]) payloadByUnit[unit] = {};
    payloadByUnit[unit][type] = (payloadByUnit[unit][type] || 0) + 1;
  }

  // Aircrew by MOS and unit (pilot 7318, SO 7314) from v_staffing
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

function buildMissionMap(scenario) {
  const map = new Map();
  for (const mt of scenario.mission_types) {
    map.set(mt.name, mt);
  }
  return map;
}

function generateDemand(scenario) {
  const horizon = scenario.horizon_hours;
  const events = [];
  const demandList = scenario.demand || [];
  for (const d of demandList) {
    const typ = d.type || 'poisson';
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
      // rate_per_hour (λ) = average number of missions expected per hour
      // Example: rate=2.5 means we expect 2.5 missions per hour on average (60 missions over 24 hours)
      const rate = d.rate_per_hour || 0;
      if (rate <= 0) continue;
      let t = 0;
      // Generate demands using exponential inter-demand times
      // For a Poisson process with rate λ, time between demands follows Exponential(λ)
      // Formula: dt = -ln(1-u)/λ where u ~ Uniform(0,1)
      // This produces random intervals that average to 1/λ hours between demands
      while (t < horizon) {
        const dt = sampleDist({ type: 'exponential', rate_per_hour: rate });
        t += dt; // Advance to next demand time
        if (t <= horizon) {
          events.push({ time: t, type: 'mission_demand', mission_type: d.mission_type });
        }
      }
    }
  }
  events.sort((a, b) => a.time - b.time);
  return events;
}

async function runSimulation(scenario, options = {}) {
  const horizon = scenario.horizon_hours || 24;
  const missionTypes = buildMissionMap(scenario);
  const preSpec = scenario.process_times?.preflight;
  const postSpec = scenario.process_times?.postflight;
  const turnSpec = scenario.process_times?.turnaround;

  // Load initial resources
  let initial;
  if (options.state) {
    initial = deriveInitialFromState(options.state);
  }
  if (!initial || !initial.units || initial.units.length === 0) {
    throw new Error('Simulation requires a valid state snapshot with tables: v_aircraft, v_payload, v_staffing, v_unit');
  }

  // Apply overrides (replace derived counts) if provided
  const overrides = options.overrides && options.overrides.units ? options.overrides.units : null;
  if (overrides) {
    // Collect all payload types required by scenario to ensure pools exist when overridden
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
  const pools = {};
  for (const unit of initial.units) {
    const acTotal = initial.aircraftByUnit[unit] || 0;
    const crew = initial.crewByUnit[unit] || { pilot: 0, so: 0 };
    pools[unit] = {
      aircraft: new ResourcePool(`aircraft:${unit}`, acTotal),
      pilot: new ResourcePool(`pilot:${unit}`, crew.pilot || 0),
      so: new ResourcePool(`so:${unit}`, crew.so || 0),
      payloads: {},
      missionFinishes: [],
    };
    const payloads = initial.payloadByUnit[unit] || {};
    for (const [ptype, count] of Object.entries(payloads)) {
      pools[unit].payloads[ptype] = new ResourcePool(`payload:${unit}:${ptype}`, count || 0);
    }
  }

  // Event list
  const events = generateDemand(scenario);
  const results = {
    horizon_hours: horizon,
    missions: { requested: 0, started: 0, completed: 0, rejected: 0 },
    rejections: { aircraft: 0, pilot: 0, so: 0, payload: 0 },
    utilization: {},
    by_type: {},
    timeline: [], // detailed events for Gantt-like visualization
    initial_resources: {
      units: initial.units.slice(),
      aircraftByUnit: initial.aircraftByUnit,
      crewByUnit: initial.crewByUnit,
      payloadByUnit: initial.payloadByUnit,
      overrides_applied: Boolean(overrides)
    }
  };

  // Helper to select unit based on mission_split
  const split = scenario.unit_policy?.mission_split || {};
  const unitList = Object.keys(pools);
  function pickUnit(idx) {
    // Simple round-robin weighted by split ratios
    if (!unitList.length) return null;
    if (!Object.keys(split).length) return unitList[idx % unitList.length];
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

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type !== 'mission_demand') continue;
    if (ev.time > horizon) break;
    results.missions.requested++;
    const mt = missionTypes.get(ev.mission_type);
    if (!mt) continue;
    const unit = pickUnit(i);
    if (!unit) continue;
    const pool = pools[unit];

    // Determine total mount time for required payloads (sum of per-payload process)
    let mountTime = 0;
    for (const ptype of mt.required_payload_types || []) {
      const spec = scenario.process_times?.mount_times?.[ptype];
      mountTime += sampleDist(spec);
    }
    // Sample per-mission times
    const pre = sampleDist(preSpec);
    const flight = sampleDist(mt.flight_time);
    const post = sampleDist(postSpec);
    const turnaround = sampleDist(turnSpec);
    const duration = pre + mountTime + flight + post + turnaround;

    // Try to acquire resources at arrival time
    const needPilot = mt.required_aircrew?.pilot || 0;
    const needSO = mt.required_aircrew?.so || 0;
    const payloadTypes = mt.required_payload_types || [];

    // Check payload availability first (to produce granular rejection reason)
    let payloadOk = true;
    for (const ptype of payloadTypes) {
      const p = pool.payloads[ptype] || new ResourcePool(`payload:${unit}:${ptype}`, 0);
      if (p.availableAt(ev.time) < 1) { payloadOk = false; break; }
    }

    if (!payloadOk) {
      results.missions.rejected++;
      results.rejections.payload++;
      results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: 'payload' });
      continue;
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

    // Acquire resources (commit)
    for (const ptype of payloadTypes) {
      pool.payloads[ptype].tryAcquire(ev.time, duration, 1);
    }
    pool.aircraft.tryAcquire(ev.time, duration, 1);
    if (needPilot) pool.pilot.tryAcquire(ev.time, duration, needPilot);
    if (needSO) pool.so.tryAcquire(ev.time, duration, needSO);
    pool.missionFinishes.push(ev.time + duration);

    results.missions.started++;
    const bt = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
    bt.requested = (bt.requested || 0) + 1;
    bt.started = (bt.started || 0) + 1;
    results.by_type[mt.name] = bt;

    // Record detailed mission timeline
    const t0 = ev.time;
    const t1 = t0 + pre;
    const t2 = t1 + mountTime;
    const t3 = t2 + flight;
    const t4 = t3 + post;
    const t5 = t4 + turnaround;
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

  // Completed missions: count finish times within horizon (overall)
  for (const unit of unitList) {
    const pool = pools[unit];
    const completed = pool.missionFinishes.filter(t => t <= horizon).length;
    results.missions.completed += completed;
  }

  // Per-mission-type completion counts (using timeline finish times)
  for (const item of results.timeline) {
    if (item.type === 'mission' && item.finish_time <= horizon) {
      const btC = results.by_type[item.mission_type] || { requested: 0, started: 0, completed: 0, rejected: 0 };
      btC.completed = (btC.completed || 0) + 1;
      results.by_type[item.mission_type] = btC;
    }
  }

  // Utilization per unit
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
