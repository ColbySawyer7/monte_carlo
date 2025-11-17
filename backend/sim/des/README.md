# DES Engine

## Overview

This Discrete Event Simulation (DES) engine models aircraft mission operations by simulating resource allocation and mission execution over time. The engine processes events at discrete points in time rather than simulating continuous time, making it efficient for modeling complex resource-constrained systems.

## What is Discrete Event Simulation?

Discrete Event Simulation (DES) is a simulation technique where:
- **Events** occur at specific points in time (e.g., mission demands, resource releases)
- The simulation **jumps from event to event** rather than tracking continuous time
- System state changes only at event times
- Resources are held for durations and released at future times

This approach is ideal for modeling systems where:
- Events are discrete (mission arrivals, resource acquisitions)
- Resources are shared and constrained
- Process times are stochastic (variable)
- We need to identify bottlenecks and utilization

## Algorithm Overview

The DES engine follows a 4-step process:

### Step 1: Initialize Resources
- Extract initial resource counts from state snapshot (database views)
- Create resource pools for each unit (aircraft, pilots, sensor operators, payloads)
- Apply resource overrides if provided (for "what-if" scenarios)

### Step 2: Generate Demand Events
- Pre-generate all mission demand events upfront
- Support two demand patterns:
  - **Deterministic**: Fixed intervals (e.g., every 2 hours)
  - **Poisson**: Random arrivals with exponential inter-arrival times
- Sort events chronologically for processing

### Step 3: Process Events (Core DES Loop)
For each demand event in chronological order:
1. **Sample Process Durations**: Generate stochastic durations for each mission phase
2. **Check Resource Availability**: Verify all required resources are available
3. **Acquire Resources** (if available): Record resource release times
4. **Record Timeline**: Create detailed mission timeline for visualization
5. **Track Rejections** (if unavailable): Record rejection reason for bottleneck analysis

### Step 4: Calculate Statistics
- Count completed missions (finish time ≤ horizon)
- Calculate resource utilization per unit
- Aggregate statistics by mission type

## Key Concepts

### Resource Pools

Resources are managed as **pools** of identical items:
- Each pool tracks total capacity and currently held resources
- Resources are held for durations and released at future times
- We don't track which specific resource is held—only how many are available
- Release times are stored implicitly (no explicit release events needed)

**Example**: An aircraft pool with 5 aircraft. If 2 are in use until time 10.5, the pool stores `[10.5, 10.5]` in its `held` array. At time 11, both are available again.

### Event-Driven Processing

The simulation doesn't track continuous time. Instead:
- All demand events are generated upfront
- Events are processed in chronological order
- At each event time, we check resource availability
- Resource releases are implicit (we check if `release_time <= current_time`)

### Stochastic Modeling

Process durations are sampled from probability distributions:
- **Deterministic**: Fixed values (for testing or scheduled operations)
- **Exponential**: Models Poisson processes (e.g., inter-arrival times)
- **Triangular**: Bounded distribution with min, mode, max
- **Lognormal**: Positive values with long tails

Each mission phase (preflight, mount, flight, postflight, turnaround) has its own distribution.

## Resource Management

### Resource Types

1. **Aircraft**: Physical aircraft units (only FMC status counted)
2. **Pilots**: Aircrew with MOS 7318
3. **Sensor Operators (SO)**: Aircrew with MOS 7314
4. **Payloads**: Equipment that must be mounted (per type, per unit)

### Resource Acquisition

When a mission demand arrives:
1. Check if all required resources are available at that time
2. If available, acquire all resources simultaneously
3. Record release time = `current_time + mission_duration`
4. Resources are implicitly released at that future time

### Rejection Handling

If any required resource is unavailable:
- Mission is rejected
- Rejection reason is recorded (aircraft, pilot, SO, or payload)
- Statistics track rejections by reason to identify bottlenecks

## Event Generation

### Deterministic Demand
- Fixed intervals (e.g., every 2 hours)
- Useful for scheduled operations or testing
- Example: `{ type: 'deterministic', every_hours: 2, mission_type: 'ISR' }`

### Poisson Demand
- Random arrivals following a Poisson process
- Rate parameter λ (lambda) = average missions per hour
- Inter-arrival times follow Exponential(λ) distribution
- Mean time between missions = 1/λ hours
- Example: `{ type: 'poisson', rate_per_hour: 2.5, mission_type: 'ISR' }`

**Poisson Process Theory**:
- For a Poisson process with rate λ, the time between arrivals follows Exponential(λ)
- Formula: `dt = -ln(1-u)/λ` where `u ~ Uniform(0,1)`
- This produces random intervals that average to 1/λ hours

## Mission Lifecycle

Each mission consists of sequential phases:

1. **Preflight**: Preparation time (stochastic)
2. **Mount**: Payload mounting time (sum of per-payload mount times)
3. **Flight**: Actual mission flight time (mission-specific, stochastic)
4. **Postflight**: Post-mission processing (stochastic)
5. **Turnaround**: Time before aircraft is ready for next mission (stochastic)

**Total Duration** = preflight + mount + flight + postflight + turnaround

All resources (aircraft, crew, payloads) are held for the entire duration.

## Statistics and Metrics

### Mission Statistics
- **Requested**: Total mission demands generated
- **Started**: Missions that acquired all required resources
- **Completed**: Missions that finished within the simulation horizon
- **Rejected**: Missions that couldn't acquire required resources

### Rejection Reasons
Tracked separately to identify bottlenecks:
- Aircraft unavailability
- Pilot unavailability
- Sensor Operator unavailability
- Payload unavailability

### Resource Utilization
Calculated per unit for each resource type:
```
Utilization = (Total busy time) / (Total capacity time)
```

**Example**: 2 aircraft held for 10 hours total over 24-hour period:
- Total capacity = 2 × 24 = 48 aircraft-hours
- Busy time = 10 aircraft-hours
- Utilization = 10/48 = 0.208 (20.8%)

High utilization (>0.8) may indicate resource bottlenecks.

### Per-Mission-Type Statistics
All statistics are also broken down by mission type to analyze performance for different mission requirements.

## Timeline Visualization

The engine generates a detailed timeline for each mission:
- Demand arrival time
- Finish time
- Phase segments (preflight, mount, flight, postflight, turnaround)

This enables Gantt chart-style visualizations showing:
- When missions start and finish
- Resource usage over time
- Mission overlaps and gaps

## Multi-Unit Support

The engine supports multiple organizational units:
- Each unit has independent resource pools
- Mission split policy determines which unit handles each demand
- Supports weighted random selection or round-robin
- Statistics are tracked per unit

## Usage Example

```javascript
const { runSimulation } = require('./engine');

const scenario = {
  horizon_hours: 24,
  mission_types: [
    {
      name: 'ISR',
      required_aircrew: { pilot: 1, so: 1 },
      required_payload_types: ['SkyTower II'],
      flight_time: { type: 'triangular', a: 2, m: 3, b: 4 }
    }
  ],
  demand: [
    {
      type: 'poisson',
      rate_per_hour: 2.5,
      mission_type: 'ISR'
    }
  ],
  process_times: {
    preflight: { type: 'deterministic', value_hours: 0.5 },
    postflight: { type: 'deterministic', value_hours: 0.5 },
    turnaround: { type: 'triangular', a: 0.5, m: 1, b: 1.5 },
    mount_times: {
      'SkyTower II': { type: 'deterministic', value_hours: 0.25 }
    }
  }
};

const results = await runSimulation(scenario, {
  state: stateSnapshot, // Database view snapshot
  overrides: { // Optional resource overrides
    units: {
      'Unit A': {
        aircraft: 5,
        pilot: 10,
        so: 10,
        payload_by_type: { 'SkyTower II': 6 }
      }
    }
  }
});
```

## Key Design Decisions

1. **Minimal Event List**: Only demand events are pre-generated; resource releases are implicit
2. **No Explicit Release Events**: Resources are released when `release_time <= current_time` (lazy cleanup)
3. **State Snapshot Based**: Initial resources derived from database views (no live DB queries)
4. **Stochastic Process Times**: All durations sampled from distributions to model variability
5. **Granular Rejection Tracking**: Separate rejection reasons help identify bottlenecks

## Performance Characteristics

- **Time Complexity**: O(E × R) where E = events, R = resource types per unit
- **Space Complexity**: O(E + U × R) where U = units, R = resource types
- **Efficient**: No continuous time tracking, only event processing
- **Scalable**: Handles multiple units and mission types efficiently

## Limitations

- **No Queuing**: Rejected missions are lost (no waiting queue)
- **No Preemption**: Once resources are acquired, they're held for full duration
- **No Resource Sharing**: Resources are exclusive (one mission per resource)
- **Deterministic Resource Selection**: No priority-based or optimization-based selection
