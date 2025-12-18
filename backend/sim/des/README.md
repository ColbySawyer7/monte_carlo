# DES Engine Documentation

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Simulation Stages](#simulation-stages)
  - [Stage 1: Scenario Processing](#stage-1-scenario-processing)
  - [Stage 2: Settings Application](#stage-2-settings-application)
  - [Stage 3: Personnel Processing](#stage-3-personnel-processing)
  - [Stage 4: Operations Processing](#stage-4-operations-processing)
  - [Stage 5: Simulation Execution](#stage-5-simulation-execution)
    - [Stage 5a: Mission Processing](#stage-5a-mission-processing)
    - [Stage 5b: Duty Processing](#stage-5b-duty-processing)
  - [Stage 6: Results Generation](#stage-6-results-generation)
- [Helper Modules](#helper-modules)
  - [Availability Module](#availability-module-helpersavailabilityjs)
  - [Demand Module](#demand-module-helpersdemandjs)
  - [Distributions Module](#distributions-module-helpersdistributionsjs)
  - [Resources Module](#resources-module-helpersresourcesjs)
- [Configuration Flags Reference](#configuration-flags-reference)
- [Data Flow Diagram](#data-flow-diagram)
- [Key Algorithms](#key-algorithms)
- [Performance Considerations](#performance-considerations)
- [Common Patterns](#common-patterns)
- [Glossary](#glossary)
- [Version History](#version-history)

## Overview

The **DES (Discrete Event Simulation) Engine** is a discrete event simulator for modeling squadron operations. It simulates mission demands, duty requirements, resource allocation, crew scheduling, and generates comprehensive results including utilization metrics and rejection analysis.

The engine processes events chronologically, allocating resources (aircraft, crew, payloads) to missions and duties while respecting constraints like crew rest, work schedules, availability factors, and duty rotation policies.

---

## Architecture

The simulation follows a **six-stage pipeline**:

```
Stage 1: Scenario       → Extract configuration and parameters
Stage 2: Settings       → Load state and apply resource overrides
Stage 3: Personnel      → Initialize crew pools with availability
Stage 4: Operations     → Generate demand events and resource pools
Stage 5: Simulation     → Process all events and allocate resources
Stage 6: Results        → Generate final metrics and statistics
```

---

## Simulation Stages

### Stage 1: Scenario Processing

**Purpose:** Extract and validate scenario configuration parameters.

**Location:** `stages/stage1-scenario.js`

**Key Operations:**
- Extract simulation horizon (duration in hours)
- Build mission type lookup map for fast access
- Extract process time specifications (preflight, postflight, turnaround)

**Inputs:**
- `scenario`: Full scenario configuration object

**Outputs:**
- `horizon`: Simulation duration in hours
- `missionTypes`: Map of mission type name → mission type object
- `preSpec`, `postSpec`, `turnSpec`: Process time distribution specifications

---

### Stage 2: Settings Application

**Purpose:** Load initial state and apply resource overrides.

**Location:** `stages/stage2-settings.js`

**Key Operations:**
- Load resource counts from database state (if provided)
- Apply manual resource overrides (if provided)
- Merge state data with scenario defaults

**Inputs:**
- `settings.state`: Database state snapshot with aircraft, staffing, payload counts
- `settings.overrides`: Manual resource overrides by unit
- `scenario`: Scenario configuration

**Outputs:**
- `initial`: Object containing:
  - `units`: List of active unit names
  - `aircraftByUnit`: Map of unit → aircraft count
  - `staffingByUnit`: Map of unit → MOS → personnel count
  - `payloadByUnit`: Map of unit → payload type → payload count

**Override Behavior:**

| Setting | Description | Effect |
|---------|-------------|--------|
| `state` provided | Database state loaded | Uses live data from database |
| `overrides` provided | Manual resource counts | Overrides state/scenario values for specified units |
| Neither provided | Scenario defaults used | Uses counts from scenario configuration |
| Both provided | Override wins | Overrides take precedence over state data |

---

### Stage 3: Personnel Processing

**Purpose:** Initialize crew pools with availability factors and work schedules.

**Location:** `stages/stage3-personnel.js`

**Key Operations:**
- Calculate availability factors for each MOS (accounts for leave, training, medical, etc.)
- Apply mission split percentages to determine crew allocation per unit
- Initialize crew queues with work schedule configuration
- Set up crew rest periods and shift assignments

**Inputs:**
- `scenario.personnel`: Personnel configuration with availability and work schedules
- `scenario.unit_policy.mission_split`: Percentage split of missions across units
- `initial`: Resource counts from Stage 2

**Outputs:**
- `personnel`: Object containing crew queue configurations for each unit/MOS

**Availability Factor Calculation:**

Availability factor represents the fraction of time personnel are available, accounting for:
- Annual leave days
- Range training days
- Safety standdown days (quarterly)
- Medical/dental days (monthly)
- Training days (monthly)

**Formula:**
```
unavailable_days = leave + range + (standdown × 4) + (medical × 12) + (training × 12)
availability_factor = (365 - unavailable_days) / 365
effective_personnel = total × availability_factor
```

**Note:** SDO/SDNCO duty days are **NOT** included in availability factor - they are modeled as continuous duty requirements in Stage 4.

**Work Schedule Configuration:**

| Parameter | Description | Default | Effect |
|-----------|-------------|---------|--------|
| `days_on` | Working days per cycle | 365 | Crew works this many consecutive days |
| `days_off` | Days off per cycle | 0 | Crew gets this many consecutive days off |
| `daily_start_hour` | Hour of day work begins (0-23) | 0 | Crew work period starts at this hour |
| `daily_crew_rest_hours` | Hours of crew rest per day | 0 | Crew unavailable for this many hours per day |
| `shift_split_enabled` | Split crew into two 12-hour shifts | false | When true, creates Shift 1 and Shift 2 |
| `shift_split_percent` | Percentage assigned to Shift 1 | 50 | Remaining crew assigned to Shift 2 |
| `stagger_days_off` | Days to stagger each crew member's cycle | 0 | Prevents all crew from having same days off |

**Shift Split Example:**

| Enabled | Shift 1 Hours | Shift 2 Hours | Effect |
|---------|---------------|---------------|--------|
| `false` | 0-24 | N/A | All crew available 24/7 (minus crew rest) |
| `true` (start=8) | 8-20 | 20-8 (next day) | Crew split into 12-hour day/night shifts |

---

### Stage 4: Operations Processing

**Purpose:** Generate demand events and initialize resource pools.

**Location:** `stages/stage4-operations.js`

**Key Operations:**
- Generate mission demand events (Poisson or deterministic)
- Generate duty shift demand events (ODO, SDO, SDNCO)
- Assign missions to units based on mission split policy
- Initialize equipment pools (aircraft, payloads)
- Initialize crew queues with work schedules
- Sort all events chronologically (missions before duties at same time)

**Inputs:**
- `scenario`: Full scenario configuration
- `initial`: Resource counts from Stage 2
- `personnel`: Crew configurations from Stage 3

**Outputs:**
- `events`: Sorted array of all demand events
- `pools`: Map of unit → resource pools (aircraft, crew, payloads)
- `unitList`: List of active unit names

**Mission Demand Generation:**

| Type | Parameters | Behavior |
|------|------------|----------|
| `deterministic` | `every_hours`, `start_at_hours` | Creates mission every X hours, starting at specified time |
| `poisson` | `rate_per_hour` | Creates missions at random intervals with exponential distribution |

**Duty Demand Generation:**

| Duty Type | Description | Scheduling |
|-----------|-------------|------------|
| `ODO` (Operations Duty Officer) | Required only during active mission operations | Scheduled only when missions are running (preflight → postflight) |
| `SDO` (Squadron Duty Officer) | Required 24/7 for base operations | Scheduled at fixed intervals throughout simulation |
| `SDNCO` (Squadron Duty NCO) | Required 24/7 for enlisted supervision | Scheduled at fixed intervals throughout simulation |

**Duty Configuration:**

| Parameter | Description | Default | Effect |
|-----------|-------------|---------|--------|
| `enabled` | Whether this duty type is active | false | When false, no duty events generated |
| `shifts_per_day` | Number of shifts in 24 hours | 1 | Creates X duty events per day |
| `hours_per_shift` | Duration of each shift | 8 | Each duty assignment lasts this long |
| `start_hour` | Hour of day first shift starts (0-23) | 0 | Shifts begin at this hour |
| `requires_pilot` | Pilot can fill this duty (1=yes, 0=no) | 0 | When 1, pilots are eligible |
| `requires_so` | SO can fill this duty (1=yes, 0=no) | 0 | When 1, SOs are eligible |
| `requires_intel` | Intel can fill this duty (1=yes, 0=no) | 0 | When 1, Intel are eligible |
| `respect_work_schedule` | Honor days on/off cycles | false | When true, only assigns duty during days on |
| `duty_recovery_hours` | Rest period after duty ends | 0 | Crew unavailable for X hours after duty |

**Mission Split Policy:**

Units receive missions proportionally based on configured percentages:

| Unit | Split % | Effect |
|------|---------|--------|
| VMU-1 | 60% | Gets 60% of generated missions |
| VMU-3 | 40% | Gets 40% of generated missions |

Units with 0% split are excluded from mission assignment and duty scheduling.

---

### Stage 5: Simulation Execution

**Purpose:** Process all demand events and allocate resources.

**Location:** `stages/stage5-simulation.js`, `stages/stage5a-mission-processing.js`, `stages/stage5b-duty-processing.js`

**Key Operations:**
- Sort events to process missions before duties at same time
- Process mission demands (Stage 5a)
- Process duty demands (Stage 5b)
- Track resource allocations and rejections
- Generate timeline of all assignments

**Event Processing Order:**

1. **Sort Phase:** Events sorted by time, then by type (missions before duties)
2. **Mission Phase:** All mission demands at time T processed first
3. **Duty Phase:** All duty demands at time T processed after missions

**Why missions first?** Missions have higher priority and stricter resource requirements. Duties are more flexible (multiple MOS types can fill them).

---

#### Stage 5a: Mission Processing

**Purpose:** Allocate resources to mission demands.

**Key Operations:**
1. Check payload availability
2. Check aircraft availability
3. Check crew availability (with duty lookahead)
4. Allocate resources if all available
5. Reject mission if any resource unavailable
6. Track accepted missions for ODO alignment

**Mission Duration Calculation:**

```
duration = preflight + mount + transit_in + flight + transit_out + postflight + turnaround
```

**Crew Hold Duration:**

| Flag | Crew Hold Calculation | Effect |
|------|----------------------|--------|
| `hold_crew_during_process_times = true` | Full mission duration | Crew held from preflight through turnaround |
| `hold_crew_during_process_times = false` | `transit_in + flight + transit_out` | Crew only held during actual flight operations |

**Duty Lookahead:**

| Flag | Behavior | Effect |
|------|----------|--------|
| `lookahead.enabled = true` | Reserve crew for upcoming duties | Prevents missions from taking crew needed for imminent duties |
| `lookahead.enabled = false` | No reservation | Missions can take all available crew |

**Lookahead Hours:**
- Default: 72 hours
- Scans ahead to find duty requirements within lookahead window
- Reserves crew proportionally based on eligible MOS types
- **Note:** ODO is excluded from lookahead (only assigned when missions accepted)

**Crew Distribution:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `concentrate` | Use fewest crew members possible | Maximizes crew rest, concentrates flight hours |
| `distribute` | Spread across more crew members | Distributes flight hours evenly, reduces burnout |

**Crew Rotation:**

| Setting | Description | Effect |
|---------|-------------|--------|
| `enabled = false` | All crew fly full mission | Simple scheduling, crew held entire mission |
| `enabled = true` | Crew rotate during mission | Complex scheduling, different crew for different segments |
| `sequential = true` | Crew swaps happen sequentially | Crew 1 → Crew 2 → Crew 3 (no overlap) |
| `sequential = false` | Crew can overlap | Multiple crews flying simultaneously during transitions |

**Shift Configuration:**
- `pilot_shifts`: Array of durations for each pilot rotation
- `so_shifts`: Array of durations for each SO rotation  
- `intel_shifts`: Array of durations for each Intel rotation

---

#### Stage 5b: Duty Processing

**Purpose:** Allocate crew to duty shift demands.

**Key Operations:**
1. Determine eligible MOS types for duty
2. Cycle through MOS types fairly (round-robin)
3. Allocate crew from eligible pool
4. Handle ODO mission alignment
5. Track duty assignments and recovery periods

**Duty ID Calculation:**

```
day_number = floor((time - first_shift_start) / 24) + 1
shift_number = floor(hour_in_day / (24 / shifts_per_day)) + 1

If shifts_per_day > 1:
  duty_id = "day-shift"  (e.g., "3-2" = Day 3, Shift 2)
Else:
  duty_id = "day"  (e.g., "5" = Day 5)
```

**MOS Cycling:**

Eligible MOS types are cycled in round-robin fashion to ensure fair duty distribution:

```
Duty 1: Pilot fills it
Duty 2: SO fills it
Duty 3: Intel fills it
Duty 4: Pilot fills it
...and so on
```

**ODO Mission Alignment:**

| Scenario | ODO Behavior | Effect |
|----------|--------------|--------|
| Missions scheduled in ODO window | ODO covers mission operations only | ODO start/end trimmed to actual mission period |
| No missions in ODO window | ODO skipped | No ODO assigned if no missions to oversee |
| Multiple missions overlapping | ODO covers merged period | Single ODO covers entire span of operations |

**ODO Coverage Calculation:**

```
scheduled_window = [ODO_start, ODO_end]
mission_window = [earliest_mission_preflight, latest_mission_postflight]
actual_coverage = intersection(scheduled_window, mission_window)
```

**Duty Recovery:**

| Parameter | Effect |
|-----------|--------|
| `duty_recovery_hours = 0` | No recovery period | Crew immediately available after duty |
| `duty_recovery_hours = 8` | 8-hour recovery | Crew unavailable for 8 hours after duty ends |

---

### Stage 6: Results Generation

**Purpose:** Calculate final metrics and statistics.

**Location:** `stages/stage6-results.js`

**Key Operations:**
- Calculate resource utilization (aircraft, payloads, crew)
- Calculate efficiency metrics
- Aggregate mission statistics by type
- Format timeline for visualization
- Calculate peak concurrent usage

**Outputs:**

**Mission Statistics:**
- `requested`: Total mission demands generated
- `started`: Missions that got all resources and began
- `completed`: Missions that finished successfully
- `rejected`: Missions that couldn't get resources

**Rejection Breakdown:**
- `aircraft`: Rejected due to no aircraft available
- `pilot`: Rejected due to insufficient pilots
- `so`: Rejected due to insufficient SOs
- `intel`: Rejected due to insufficient Intel
- `payload`: Rejected due to payload unavailable

**Utilization Metrics:**
- `utilization`: Percentage of resources used at least once
- `efficiency`: Aggregate busy time / available capacity
- `peak_concurrent`: Maximum resources used simultaneously

---

## Helper Modules

### Availability Module (`helpers/availability.js`)

**Purpose:** Calculate personnel availability factors and generate availability timelines.

#### `calculateAvailabilityFactor(availability)`

**Description:** Calculates the fraction of time personnel are available, accounting for leave, training, medical appointments, and other unavailability reasons.

**Inputs:**
- `availability.leave_days_annual`: Annual leave days
- `availability.range_days_annual`: Range training days per year
- `availability.safety_standdown_days_quarterly`: Safety standdown days per quarter
- `availability.medical_days_monthly`: Medical/dental days per month
- `availability.training_days_monthly`: Training days per month

**Formula:**
```javascript
unavailable_days = leave + range + (standdown × 4) + (medical × 12) + (training × 12)
availability_factor = (365 - unavailable_days) / 365
```

**Returns:** Availability factor between 0.1 and 1.0

**Note:** SDO/SDNCO duty days are NOT included - they are modeled as continuous duty requirements.

#### `generateAvailabilityTimeline(availability, totalPersonnel, horizonHours, dutyRequirements, mos)`

**Description:** Generates a timeline showing personnel availability over the simulation horizon with reasons for unavailability.

**Inputs:**
- `availability`: Availability configuration
- `totalPersonnel`: Total number of personnel in category
- `horizonHours`: Simulation duration
- `dutyRequirements`: Duty shift configuration
- `mos`: MOS code to determine applicable duties

**Returns:** Array of availability snapshots at regular intervals showing:
- Available count
- Unavailable counts by reason (leave, medical, training, days off, etc.)
- Duty counts (ODO, SDO, SDNCO)

---

### Demand Module (`helpers/demand.js`)

**Purpose:** Generate mission and duty demand events.

#### `buildMissionMap(scenario)`

**Description:** Builds a fast-lookup Map of mission types indexed by name.

**Inputs:**
- `scenario.mission_types`: Array of mission type definitions

**Returns:** Map<string, Object> of mission type name → mission type object

#### `generateDemand(scenario)`

**Description:** Generates all mission and duty demand events for the simulation horizon.

**Mission Demand Types:**

| Type | Parameters | Algorithm |
|------|------------|-----------|
| `deterministic` | `every_hours`, `start_at_hours` | `t = start; while (t < horizon) { add_event(t); t += every; }` |
| `poisson` | `rate_per_hour` | `t = 0; while (t < horizon) { t += exponential(rate); add_event(t); }` |

**Duty Demand Generation:**

For non-ODO duties (SDO, SDNCO):
```javascript
shift_interval = 24 / shifts_per_day
for each day in horizon:
  for each shift in day:
    t = day_start + (shift_number × shift_interval)
    add_duty_event(t, duty_type, hours_per_shift)
```

For ODO duties:
1. Calculate all mission operation periods (preflight → postflight)
2. Merge overlapping mission periods
3. Create ODO shifts only during merged mission periods

**Returns:** Sorted array of demand events with time, type, and requirements

---

### Distributions Module (`helpers/distributions.js`)

**Purpose:** Sample values from probability distributions.

#### `sampleDist(spec)`

**Description:** Samples a random value from the specified distribution.

**Supported Distributions:**

| Type | Parameters | Formula | Use Case |
|------|------------|---------|----------|
| `deterministic` | `value_hours` or `value` | Returns fixed value | Fixed process times |
| `exponential` | `rate_per_hour` | `-log(1 - U) / λ` | Time between Poisson events |
| `triangular` | `a` (min), `m` (mode), `b` (max) | See formula below | Flight times with most likely value |
| `lognormal` | `mu`, `sigma` | `exp(μ + σZ)` | Skewed durations (maintenance, delays) |

**Triangular Distribution Formula:**
```javascript
U = random()
c = (m - a) / (b - a)
if (U < c):
  return a + sqrt(U × (b - a) × (m - a))
else:
  return b - sqrt((1 - U) × (b - a) × (b - m))
```

**Returns:** Sampled value in hours

---

### Resources Module (`helpers/resources.js`)

**Purpose:** Manage resource pools and crew queues with scheduling logic.

#### EquipmentPool Class

**Description:** Manages fixed pools of equipment (aircraft, payloads).

**Key Methods:**

| Method | Purpose | Returns |
|--------|---------|---------|
| `availableAt(time)` | Get count of available equipment at given time | Number available |
| `tryAcquire(time, duration, count)` | Attempt to allocate equipment | true if successful |
| `utilization()` | Calculate fraction of equipment used at least once | Ratio 0-1 |
| `efficiency(horizonHours)` | Calculate aggregate busy time / capacity | Ratio 0-1 |
| `getStats(horizonHours)` | Get comprehensive statistics | Object with metrics |

**Tracking:**
- `held`: Array of release times for currently allocated equipment
- `busyTime`: Cumulative hours equipment was allocated
- `allocations`: Total successful allocations
- `denials`: Total failed allocation attempts
- `usedCount`: Peak concurrent usage

#### CrewQueue Class

**Description:** Manages crew members with rotation, rest periods, scheduling, and fair distribution.

**Key Methods:**

| Method | Purpose | Returns |
|--------|---------|---------|
| `availableAt(time)` | Get count of available crew at given time | Number available |
| `availableByShift(time)` | Get availability broken down by shift | Object with shift counts |
| `isInDaysOnCycle(time, crewId)` | Check if in working period of work cycle | Boolean |
| `isInWorkingHours(crewMember, time)` | Check if in daily working hours | Boolean |
| `tryAcquireShifts(time, shifts, ...)` | Allocate crew for mission/duty | Array of assignments |
| `getShiftStatus(time)` | Get detailed status by shift | Object with shift breakdown |

**Crew Tracking:**
- `crew`: Array of crew member objects with availability times
- `dutyAssignmentCount`: Map of crew member → duty count (for fair rotation)
- `usedCrewIds`: Set of crew members used at least once
- `busyTime`: Cumulative hours crew were assigned

**Crew Member Object:**
```javascript
{
  id: 0,                    // Unique identifier
  availableAt: 0,           // Time when available again (hours)
  missionCount: 0,          // Number of missions flown
  shift: 1                  // Shift assignment (1 or 2)
}
```

**Shift Selection Logic:**

| Scenario | Selection Logic |
|----------|----------------|
| No shift split | Select from all crew based on availability |
| Shift split enabled | Prioritize crew from shift that matches current time |
| Mixed shift preference | Can pull from other shift if preferred shift depleted |

---

## Configuration Flags Reference

### Process Times

| Flag | Values | Default | Effect |
|------|--------|---------|--------|
| `hold_crew_during_process_times` | true/false | true | **true:** Crew held for entire mission (preflight → turnaround)<br>**false:** Crew only held during flight operations (transit_in → transit_out) |

### Duty Requirements

| Flag | Values | Default | Effect |
|------|--------|---------|--------|
| `enabled` | true/false | false | **true:** Duty shifts scheduled throughout simulation<br>**false:** No duty events generated |
| `respect_work_schedule` | true/false | false | **true:** Only assign duties during crew "days on" period<br>**false:** Ignore work schedule when assigning duties |
| `requires_pilot` | 0/1 | 0 | **1:** Pilots can fill this duty<br>**0:** Pilots cannot fill this duty |
| `requires_so` | 0/1 | 0 | **1:** SOs can fill this duty<br>**0:** SOs cannot fill this duty |
| `requires_intel` | 0/1 | 0 | **1:** Intel can fill this duty<br>**0:** Intel cannot fill this duty |

### Duty Lookahead

| Flag | Values | Default | Effect |
|------|--------|---------|--------|
| `lookahead.enabled` | true/false | true | **true:** Reserve crew for upcoming duties before missions<br>**false:** Missions can use all available crew |
| `lookahead.hours` | number | 72 | Hours to look ahead for duty requirements |

### Work Schedule

| Flag | Values | Default | Effect |
|------|--------|---------|--------|
| `shift_split_enabled` | true/false | false | **true:** Split crew into Shift 1 and Shift 2 (12 hours each)<br>**false:** All crew available 24/7 (minus crew rest) |
| `stagger_days_off` | number | 0 | **0:** All crew have same days off schedule<br>**>0:** Each crew member's cycle starts N days after previous |

### Mission Configuration

| Flag | Values | Default | Effect |
|------|--------|---------|--------|
| `crew_rotation.enabled` | true/false | false | **true:** Different crew fly different mission segments<br>**false:** Same crew flies entire mission |
| `crew_rotation.sequential` | true/false | true | **true:** Crew rotations happen sequentially (no overlap)<br>**false:** Crew can overlap during transitions |
| `crew_distribution` | "concentrate"<br>"distribute" | "concentrate" | **concentrate:** Use minimum crew, maximize rest<br>**distribute:** Spread flight hours evenly |

---

## Data Flow Diagram

```
Input Scenario
     ↓
Stage 1: Extract Parameters (horizon, mission types, process times)
     ↓
Stage 2: Load State & Overrides (resource counts)
     ↓
Stage 3: Initialize Personnel (availability factors, work schedules)
     ↓
Stage 4: Generate Operations
         - Create mission demand events
         - Create duty demand events  
         - Initialize resource pools
         - Sort events (missions before duties)
     ↓
Stage 5: Simulation Loop
         For each event in chronological order:
           → If mission_demand:
               - Check payload, aircraft, crew availability
               - Reserve crew for upcoming duties (if lookahead enabled)
               - Allocate resources or reject mission
               - Track accepted missions for ODO
           → If duty_demand:
               - Cycle through eligible MOS types
               - Align ODO with mission operations
               - Allocate crew or mark unfilled
               - Apply duty recovery period
     ↓
Stage 6: Generate Results
         - Calculate utilization and efficiency
         - Aggregate mission statistics by type
         - Format timeline for visualization
     ↓
Output Results
```

---

## Key Algorithms

### Event Sorting

**Purpose:** Ensure missions are processed before duties at the same time.

```javascript
events.sort((a, b) => {
  if (a.time !== b.time) return a.time - b.time;
  const aOrder = a.type === 'mission_demand' ? 0 : 1;
  const bOrder = b.type === 'mission_demand' ? 0 : 1;
  return aOrder - bOrder;
});
```

### Duty Lookahead

**Purpose:** Reserve crew for imminent duties before allocating to missions.

```javascript
function getUpcomingDutyRequirements(unit, fromTime, lookaheadHours) {
  pilotsNeeded = 0, sosNeeded = 0, intelNeeded = 0;
  
  for each duty_event in lookahead window:
    if duty_event is ODO: skip  // ODO only assigned when missions accepted
    if duty can be filled by pilot: pilotsNeeded++
    if duty can be filled by SO: sosNeeded++
    if duty can be filled by Intel: intelNeeded++
  
  return { pilotsNeeded, sosNeeded, intelNeeded };
}

// When processing mission:
availableForMission = totalAvailable - reserved
if availableForMission < needed:
  reject mission
```

### MOS Cycling for Duties

**Purpose:** Fairly distribute duty assignments across MOS types.

```javascript
dutyMOSCycleIndex = {};  // Track last used MOS index per duty type

for each duty_event:
  eligibleMOS = [pilots, SOs, intel].filter(canFillDuty);
  
  // Rotate to next MOS
  dutyMOSCycleIndex[duty_type]++;
  currentMOS = eligibleMOS[dutyMOSCycleIndex[duty_type] % eligibleMOS.length];
  
  if currentMOS.hasAvailableCrew():
    assign crew from currentMOS
```

### ODO Mission Alignment

**Purpose:** Only schedule ODO when missions are actually running.

```javascript
for each ODO_event:
  scheduled_window = [event.time, event.time + duration];
  overlapping_missions = [];
  
  // Find missions overlapping ODO window
  for each accepted_mission:
    if mission overlaps scheduled_window:
      overlapping_missions.push(mission);
  
  if overlapping_missions.length > 0:
    earliest = min(mission.preflightStart);
    latest = max(mission.postflightEnd);
    actual_coverage = intersection(scheduled_window, [earliest, latest]);
    assign ODO for actual_coverage period;
  else:
    skip ODO (no missions to oversee);
```

---

## Performance Considerations

- **Event Sorting:** O(n log n) where n = number of events
- **Mission Lookup:** O(1) via Map data structure
- **Resource Availability Check:** O(m) where m = resources currently held (filtered each check)
- **Crew Selection:** O(c) where c = crew pool size
- **Timeline Generation:** O(e) where e = total events processed

---

## Common Patterns

### Adding a New MOS Type

1. Add MOS to `scenario.personnel` configuration
2. Update mission types to include new MOS in `required_aircrew`
3. Update duty requirements to include `requires_<new_mos>` flag
4. Add crew availability checking in Stage 5a
5. Add MOS to duty cycling logic in Stage 5b

### Adding a New Duty Type

1. Add duty configuration to `scenario.duty_requirements`
2. Set `enabled`, `shifts_per_day`, `hours_per_shift`, `start_hour`
3. Configure which MOS types can fill it (`requires_pilot`, etc.)
4. Duty events automatically generated in Stage 4
5. Duty processing handled by Stage 5b

### Modifying Resource Allocation Logic

Resource allocation logic is centralized in helper functions:
- **Mission crew allocation:** `allocateCrewForMOS()` in `stage5a-mission-processing.js`
- **Duty crew allocation:** MOS cycling loop in `stage5b-duty-processing.js`
- **Equipment allocation:** `tryAcquire()` methods in `resources.js`

---

## Glossary

| Term | Definition |
|------|------------|
| **MOS** | Military Occupational Specialty - job code (e.g., 7318 = Pilot) |
| **ODO** | Operations Duty Officer - oversees mission operations |
| **SDO** | Squadron Duty Officer - 24/7 base operations oversight |
| **SDNCO** | Squadron Duty NCO - 24/7 enlisted supervision |
| **Horizon** | Simulation duration in hours |
| **Demand Event** | A request for resources (mission or duty) at a specific time |
| **Availability Factor** | Fraction of time personnel are available (0-1) |
| **Crew Rest** | Mandatory rest period after missions/duties |
| **Work Schedule** | Pattern of days on/days off for personnel |
| **Shift Split** | Dividing crew into two 12-hour shifts |
| **Utilization** | Percentage of resources used at least once |
| **Efficiency** | Aggregate busy time divided by total capacity |
| **Lookahead** | Scanning ahead for upcoming demands to reserve resources |
| **Crew Distribution** | Policy for selecting crew (concentrate vs distribute) |
| **Sequential Rotation** | Crew swaps without overlap during mission |

---

## Version History

- **v1.0:** Initial documentation (December 2025)
- **v0.3.15:** SOR Sim application version