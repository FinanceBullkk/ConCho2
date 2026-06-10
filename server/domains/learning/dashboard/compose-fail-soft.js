// Shared fail-soft composer for dashboard bundles: every metric resolves
// independently; a failed metric becomes `null` + an errors[] entry instead of
// failing the whole response.
//   metrics: [ [key, () => Promise<value>] ]
//   → { generatedAt, ...extras, errors, <key>: value|null }
const composeFailSoft = async (metrics, extras = {}) => {
  const settled = await Promise.allSettled(metrics.map(([, build]) => build()));
  const errors = [];
  const bundle = { generatedAt: new Date().toISOString(), ...extras, errors };
  metrics.forEach(([key], index) => {
    const result = settled[index];
    if (result.status === 'fulfilled') {
      bundle[key] = result.value;
    } else {
      bundle[key] = null;
      errors.push({ metric: key, message: result.reason?.message || 'Failed to compute metric' });
    }
  });
  return bundle;
};

module.exports = { composeFailSoft };
