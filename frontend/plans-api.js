/**
 * Jira MB-3-T3: load plan catalog from GET /api/plans
 */
(function (global) {
  const apiBase = global.location?.protocol === 'file:' ? 'http://localhost:5001' : '';

  async function fetchPlans() {
    const res = await fetch(`${apiBase}/api/plans`);
    if (!res.ok) throw new Error('Failed to load plans');
    const list = await res.json();
    const byId = {};
    list.forEach((p) => {
      const { id, ...rest } = p;
      byId[id] = rest;
    });
    return byId;
  }

  async function fetchStripePublishableKey() {
    const res = await fetch(`${apiBase}/api/config/stripe`);
    if (!res.ok) throw new Error('Stripe config unavailable');
    const data = await res.json();
    return data.publishableKey;
  }

  global.AuraPlansApi = { fetchPlans, fetchStripePublishableKey, apiBase };
})(typeof window !== 'undefined' ? window : global);
