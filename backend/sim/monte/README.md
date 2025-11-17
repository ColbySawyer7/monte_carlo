# Monte Carlo Engine

## Overview

The Monte Carlo engine leverages the existing **stochastic DES engine** to run multiple simulation iterations and aggregate results. Since the DES engine already uses random sampling for process durations and demand generation, we can run it multiple times with different random seeds to generate a distribution of outcomes.

## Why Monte Carlo with DES?

The DES engine is **already stochastic**:
- **Process durations** are sampled from probability distributions (exponential, triangular, lognormal)
- **Demand generation** uses random sampling (Poisson process with exponential inter-arrival times)
- Each run produces different outcomes due to randomness

By running the DES engine **multiple times** (iterations), we can:
- Understand the **variability** in outcomes
- Calculate **percentiles** (e.g., 10th, 50th, 90th percentile of missions completed)
- Identify **confidence intervals** for key metrics
- Assess **risk** and uncertainty in planning

## How It Works

### Single DES Run (Stochastic)

Each DES run uses random sampling:
```javascript
// Inside DES engine:
const flightTime = sampleDist({ type: 'triangular', a: 2, m: 3, b: 4 }); // Random sample
const dt = sampleDist({ type: 'exponential', rate_per_hour: 2.5 }); // Random inter-arrival
```

Each run produces a **single realization** of the stochastic process. Results vary due to:
- Random process durations (preflight, flight, postflight, turnaround)
- Random demand arrival times (Poisson process)
- Random resource availability at demand times

### Monte Carlo: Multiple Iterations

Run the DES engine **N times** (e.g., 1000 iterations):
```javascript
const iterations = 1000;
const results = [];

for (let i = 0; i < iterations; i++) {
  // Each iteration uses different random samples
  const singleRun = await runSimulation(scenario, options);
  results.push(singleRun);
}
```

Each iteration is **independent** - the randomness in each run is independent of previous runs.

## Implementation Structure

### Basic Monte Carlo Wrapper

```javascript
const { runSimulation } = require('../des/engine');

async function runMonteCarlo(scenario, options = {}) {
  const iterations = options.iterations || 1000;
  const results = [];
  
  // Run DES engine multiple times
  for (let i = 0; i < iterations; i++) {
    const singleRun = await runSimulation(scenario, options);
    results.push(singleRun);
  }
  
  // Aggregate results
  return aggregateResults(results);
}
```

### Result Aggregation

The aggregation function processes all iterations to calculate:
- **Mean** (average) across all iterations
- **Percentiles** (10th, 25th, 50th, 75th, 90th, 95th, 99th)
- **Min/Max** values
- **Standard deviation**

## Result Structure

### Single DES Run Result

Each DES iteration returns:
```javascript
{
  horizon_hours: 24,
  missions: {
    requested: 60,
    started: 55,
    completed: 52,
    rejected: 5
  },
  rejections: {
    aircraft: 2,
    pilot: 1,
    so: 0,
    payload: 2
  },
  utilization: {
    'Unit A': {
      aircraft: 0.750,
      pilot: 0.680,
      so: 0.650
    }
  },
  by_type: {
    'ISR': {
      requested: 60,
      started: 55,
      completed: 52,
      rejected: 5
    }
  },
  timeline: [...],
  initial_resources: {...}
}
```

### Monte Carlo Aggregated Result

The Monte Carlo engine aggregates across all iterations:

```javascript
{
  iterations: 1000,
  horizon_hours: 24,
  
  // Aggregated mission statistics
  missions: {
    requested: {
      mean: 60.2,
      p10: 55,
      p25: 58,
      p50: 60,      // median
      p75: 62,
      p90: 65,
      p95: 67,
      p99: 70,
      min: 52,
      max: 72,
      stddev: 4.5
    },
    started: {
      mean: 54.8,
      p10: 48,
      p25: 52,
      p50: 55,
      p75: 58,
      p90: 61,
      p95: 63,
      p99: 66,
      min: 42,
      max: 68,
      stddev: 5.2
    },
    completed: {
      mean: 51.5,
      p10: 45,
      p25: 49,
      p50: 52,
      p75: 54,
      p90: 57,
      p95: 59,
      p99: 62,
      min: 40,
      max: 65,
      stddev: 5.8
    },
    rejected: {
      mean: 5.4,
      p10: 2,
      p25: 3,
      p50: 5,
      p75: 7,
      p90: 10,
      p95: 12,
      p99: 15,
      min: 0,
      max: 18,
      stddev: 3.2
    }
  },
  
  // Aggregated rejection reasons
  rejections: {
    aircraft: { mean: 2.1, p50: 2, p90: 4, ... },
    pilot: { mean: 1.5, p50: 1, p90: 3, ... },
    so: { mean: 0.3, p50: 0, p90: 1, ... },
    payload: { mean: 1.5, p50: 1, p90: 3, ... }
  },
  
  // Aggregated utilization (per unit)
  utilization: {
    'Unit A': {
      aircraft: { mean: 0.752, p50: 0.750, p90: 0.850, ... },
      pilot: { mean: 0.685, p50: 0.680, p90: 0.780, ... },
      so: { mean: 0.655, p50: 0.650, p90: 0.750, ... }
    }
  },
  
  // Aggregated statistics by mission type
  by_type: {
    'ISR': {
      requested: { mean: 60.2, p50: 60, ... },
      started: { mean: 54.8, p50: 55, ... },
      completed: { mean: 51.5, p50: 52, ... },
      rejected: { mean: 5.4, p50: 5, ... }
    }
  },
  
  // Individual iteration results (optional, for detailed analysis)
  iterations: [
    { missions: {...}, utilization: {...}, ... },
    { missions: {...}, utilization: {...}, ... },
    // ... 1000 iterations
  ]
}
```

## Implementation Example

### Complete Monte Carlo Engine

```javascript
const { runSimulation } = require('../des/engine');

/**
 * Calculate percentiles from an array of values
 */
function calculatePercentiles(values, percentiles = [10, 25, 50, 75, 90, 95, 99]) {
  const sorted = [...values].sort((a, b) => a - b);
  const result = {};
  
  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    result[`p${p}`] = sorted[Math.max(0, index)];
  }
  
  return result;
}

/**
 * Aggregate statistics from multiple DES runs
 */
function aggregateStatistics(values) {
  if (values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  
  const percentiles = calculatePercentiles(sorted);
  
  return {
    mean: Number(mean.toFixed(2)),
    ...percentiles,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stddev: Number(stddev.toFixed(2))
  };
}

/**
 * Aggregate a nested object structure (e.g., missions, rejections)
 */
function aggregateObject(iterations, path) {
  const values = {};
  
  // Collect all values for each key
  for (const iter of iterations) {
    const obj = getNestedValue(iter, path);
    if (!obj) continue;
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') {
        if (!values[key]) values[key] = [];
        values[key].push(value);
      }
    }
  }
  
  // Aggregate each key
  const result = {};
  for (const [key, arr] of Object.entries(values)) {
    result[key] = aggregateStatistics(arr);
  }
  
  return result;
}

/**
 * Helper to get nested value from object
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((o, p) => o && o[p], obj);
}

/**
 * Run Monte Carlo simulation
 */
async function runMonteCarlo(scenario, options = {}) {
  const iterations = options.iterations || 1000;
  const keepIterations = options.keepIterations || false;
  const individualResults = [];
  
  // Run DES engine multiple times
  for (let i = 0; i < iterations; i++) {
    const singleRun = await runSimulation(scenario, options);
    if (keepIterations) {
      individualResults.push(singleRun);
    }
  }
  
  // Aggregate results
  const aggregated = {
    iterations,
    horizon_hours: scenario.horizon_hours || 24,
    
    // Aggregate mission statistics
    missions: aggregateObject(individualResults, 'missions'),
    
    // Aggregate rejection reasons
    rejections: aggregateObject(individualResults, 'rejections'),
    
    // Aggregate utilization per unit
    utilization: {},
    
    // Aggregate by mission type
    by_type: {}
  };
  
  // Aggregate utilization (per unit)
  const units = new Set();
  for (const iter of individualResults) {
    if (iter.utilization) {
      Object.keys(iter.utilization).forEach(u => units.add(u));
    }
  }
  
  for (const unit of units) {
    aggregated.utilization[unit] = {};
    const resourceTypes = ['aircraft', 'pilot', 'so'];
    
    for (const resourceType of resourceTypes) {
      const values = individualResults
        .map(iter => iter.utilization?.[unit]?.[resourceType])
        .filter(v => typeof v === 'number');
      
      if (values.length > 0) {
        aggregated.utilization[unit][resourceType] = aggregateStatistics(values);
      }
    }
  }
  
  // Aggregate by mission type
  const missionTypes = new Set();
  for (const iter of individualResults) {
    if (iter.by_type) {
      Object.keys(iter.by_type).forEach(mt => missionTypes.add(mt));
    }
  }
  
  for (const mt of missionTypes) {
    aggregated.by_type[mt] = {};
    const stats = ['requested', 'started', 'completed', 'rejected'];
    
    for (const stat of stats) {
      const values = individualResults
        .map(iter => iter.by_type?.[mt]?.[stat])
        .filter(v => typeof v === 'number');
      
      if (values.length > 0) {
        aggregated.by_type[mt][stat] = aggregateStatistics(values);
      }
    }
  }
  
  // Optionally include individual iterations
  if (keepIterations) {
    aggregated.iterations = individualResults;
  }
  
  return aggregated;
}

module.exports = { runMonteCarlo };
```

## Usage Example

```javascript
const { runMonteCarlo } = require('./engine');

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
    preflight: { type: 'triangular', a: 0.3, m: 0.5, b: 0.7 },
    postflight: { type: 'triangular', a: 0.3, m: 0.5, b: 0.7 },
    turnaround: { type: 'triangular', a: 0.5, m: 1, b: 1.5 },
    mount_times: {
      'SkyTower II': { type: 'triangular', a: 0.2, m: 0.25, b: 0.3 }
    }
  }
};

const results = await runMonteCarlo(scenario, {
  state: stateSnapshot,
  iterations: 1000,        // Run 1000 iterations
  keepIterations: false    // Don't store individual results (saves memory)
});

// Access aggregated results
console.log(`Average missions completed: ${results.missions.completed.mean}`);
console.log(`90th percentile: ${results.missions.completed.p90}`);
console.log(`Median (50th percentile): ${results.missions.completed.p50}`);
```

## Key Considerations

### Number of Iterations

- **100 iterations**: Quick testing, rough estimates
- **1,000 iterations**: Standard for most analyses, good balance of accuracy and speed
- **10,000+ iterations**: High precision, for critical decisions or research

More iterations = more accurate percentiles, but slower execution.

### Random Seed Control

The DES engine uses `Math.random()` which is seeded by the JavaScript runtime. For reproducibility:
- Consider adding a seed parameter to control randomness
- Use a seeded random number generator (e.g., seedrandom library)
- Document the random number generator used

### Memory Management

Storing all individual iterations can be memory-intensive:
- Set `keepIterations: false` for large runs
- Only store iterations if you need detailed analysis
- Consider streaming results to disk for very large runs

### Performance

- Each iteration is independent → can be parallelized
- Consider using worker threads or clustering for large iteration counts
- Profile to identify bottlenecks (likely in DES engine itself)

## Interpreting Results

### Percentiles

- **p50 (median)**: The "typical" outcome - 50% of runs are above, 50% below
- **p10/p90**: The range where 80% of outcomes fall (10th to 90th percentile)
- **p95/p99**: Extreme outcomes - useful for risk assessment

### Example Interpretation

```javascript
missions: {
  completed: {
    mean: 51.5,    // Average across all runs
    p50: 52,       // Median: half the runs completed 52 or more
    p10: 45,       // 10% of runs completed 45 or fewer
    p90: 57,       // 90% of runs completed 57 or fewer
    stddev: 5.8    // Standard deviation shows variability
  }
}
```

**Interpretation**: 
- On average, 51.5 missions are completed
- Half the time, we complete 52 or more missions
- In the worst 10% of scenarios, we complete only 45 missions
- In the best 10% of scenarios, we complete 57 missions
- The variability (stddev = 5.8) indicates significant uncertainty

### Planning Decisions

Use percentiles for risk-based planning:
- **Optimistic plan**: Use p90 (assume best-case scenario)
- **Realistic plan**: Use p50 (median outcome)
- **Conservative plan**: Use p10 (worst-case scenario)
- **Risk assessment**: Compare p10 to p90 to understand range of outcomes

## Advantages of Monte Carlo with DES

1. **Quantifies Uncertainty**: Shows not just averages, but the full distribution
2. **Risk Assessment**: Identifies worst-case and best-case scenarios
3. **Sensitivity Analysis**: Run with different resource levels to see impact
4. **Confidence Intervals**: Percentiles provide confidence bounds
5. **Bottleneck Identification**: See which resources cause variability in rejections

## Relationship to DES Engine

The Monte Carlo engine is a **wrapper** around the DES engine:
- **DES Engine**: Single stochastic run → single outcome
- **Monte Carlo Engine**: Multiple DES runs → distribution of outcomes

The DES engine remains unchanged - we simply call it multiple times and aggregate the results.
