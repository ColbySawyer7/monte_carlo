// Distribution Sampling Module
// Handles sampling from various probability distributions
// "Sampling" means generating random values based on defined statistical distributions

const { logWithLocation } = require('../../../utils');

/**
 * Sample a value from a specified distribution
 * @param {Object} spec      - Distribution specification
 * @param {string} spec.type - Distribution type: 'deterministic', 'exponential', 'triangular', 'lognormal'
 * 
 * @param {number} spec.value_hours - For deterministic: the fixed value in hours
 * @param {number} spec.value       - For deterministic: alternative generic value
 * 
 * @param {number} spec.rate_per_hour - For exponential: lambda (rate parameter)
 * @param {number} spec.rate          - For exponential: alternative rate parameter
 * 
 * @param {number} spec.a - For triangular: minimum value
 * @param {number} spec.m - For triangular: mode (most likely value)
 * @param {number} spec.b - For triangular: maximum value
 * 
 * @param {number} spec.mu    - For lognormal: mean of log-transformed variable
 * @param {number} spec.sigma - For lognormal: standard deviation of log-transformed variable
 * 
 * @returns {number} Sampled value in hours
 */
function sampleDist(spec) {
  if (!spec) return 0;
  const t = spec.type || 'deterministic';

  // deterministic distribution - fixed value
  // plain english: always returns the same fixed value
  if (t === 'deterministic') {
    if (typeof spec.value_hours === 'number') return spec.value_hours;
    if (typeof spec.value === 'number') return spec.value; // allow generic
    return 0;
  }

  // exponential distribution - time between events in Poisson process
  // plain english: returns a random value where shorter times are more likely, based on rate (λ)
  if (t === 'exponential') {
    const rate = spec.rate_per_hour || spec.rate || 1; // lambda
    const u = Math.random(); // random number between 0 and 1
    const poisson = -Math.log(1 - u) / rate; // hours
    logWithLocation('sampleDist - exponential', { rate, u, poisson });
    return poisson;
  }

  // triangular distribution - defined by min (a), mode (m), max (b)
  // plain english: returns a random value most likely near the mode, but within min and max
  if (t === 'triangular') {
    const { a, m, b } = spec; // hours
    const u = Math.random();
    const c = (m - a) / (b - a);
    if (u < c) return a + Math.sqrt(u * (b - a) * (m - a));
    return b - Math.sqrt((1 - u) * (b - a) * (b - m));
  }

  // lognormal distribution - values whose logarithm is normally distributed
  // plain english: returns a random value whose logarithm follows a normal distribution
  if (t === 'lognormal') {
    const mu = spec.mu || 0; // in log-hours
    const sigma = spec.sigma || 1;
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(mu + sigma * z);
  }

  return 0;
}

module.exports = { sampleDist };
