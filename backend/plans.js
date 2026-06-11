/**
 * Membership & billing plan catalog (Jira Epic 1, MB-3, MB-3-T1)
 * Single source of truth for prices and billing periods.
 */

const PLANS = {
  'day-class': {
    jiraStory: 'MB-2',
    family: 'day-pass.html',
    tag: 'Popular day pass',
    name: 'Day + class',
    desc: 'A day pass with one instructor-led class included in the same visit.',
    price: '£12',
    pricePence: 1200,
    per: '/ day',
    billingPeriod: 'day',
    durationDays: 1,
    note: 'Flexible access plus one group class in a single booking.',
    features: ['Full gym access', 'Locker and shower', '1 group class included']
  },
  'basic-weekly': {
    jiraStory: 'MB-1',
    family: 'weekly-plan.html',
    tag: 'Weekly membership',
    name: 'Basic weekly',
    desc: 'Seven days of gym access with lockers and showers included.',
    price: '£30',
    pricePence: 3000,
    per: '/ week',
    billingPeriod: 'week',
    durationDays: 7,
    note: 'A focused weekly plan for short-term routines or travel.',
    features: ['Full gym access', 'Locker and shower', '7-day access window']
  },
  'standard-weekly': {
    jiraStory: 'MB-1',
    family: 'weekly-plan.html',
    tag: 'Best-value weekly',
    name: 'Standard weekly',
    desc: 'Seven days of gym access plus unlimited instructor-led group classes.',
    price: '£45',
    pricePence: 4500,
    per: '/ week',
    billingPeriod: 'week',
    durationDays: 7,
    note: 'A full weekly setup with classes included throughout the week.',
    features: ['Full gym access', 'Locker and shower', 'Unlimited classes']
  },
  'premium-weekly': {
    jiraStory: 'MB-1',
    family: 'weekly-plan.html',
    tag: 'Premium weekly',
    name: 'Premium weekly',
    desc: 'Seven days of access with classes plus a personal-training session included.',
    price: '£65',
    pricePence: 6500,
    per: '/ week',
    billingPeriod: 'week',
    durationDays: 7,
    note: 'A guided weekly option with coaching support included.',
    features: ['Full gym access', 'Unlimited classes', '1 PT session included']
  },
  'basic-monthly': {
    jiraStory: 'MB-1',
    family: 'monthly-plan.html',
    tag: 'Monthly membership',
    name: 'Basic',
    desc: 'A low-cost monthly option focused on gym-floor access and essentials.',
    price: '£25',
    pricePence: 2500,
    per: '/ month',
    billingPeriod: 'month',
    durationDays: 30,
    note: 'A recurring monthly membership for consistent training.',
    features: ['Full gym access', 'Locker and shower', 'Monthly savings']
  },
  'standard-monthly': {
    jiraStory: 'MB-1',
    family: 'monthly-plan.html',
    tag: 'Popular monthly',
    name: 'Standard',
    desc: 'A complete monthly membership with unlimited classes included.',
    price: '£45',
    pricePence: 4500,
    per: '/ month',
    billingPeriod: 'month',
    durationDays: 30,
    note: 'A balanced monthly option for members who want variety and routine.',
    features: ['Full gym access', 'Unlimited classes', 'Locker and shower']
  },
  'premium-monthly': {
    jiraStory: 'MB-1',
    family: 'monthly-plan.html',
    tag: 'Premium monthly',
    name: 'Premium',
    desc: 'A high-touch monthly plan with classes and four PT sessions included.',
    price: '£75',
    pricePence: 7500,
    per: '/ month',
    billingPeriod: 'month',
    durationDays: 30,
    note: 'A top-tier monthly membership with coaching built in.',
    features: ['Full gym access', 'Unlimited classes', '4 PT sessions per month']
  }
};

function getPlan(planId) {
  return PLANS[planId] || null;
}

function getAllPlans() {
  return Object.entries(PLANS).map(([id, plan]) => ({ id, ...plan }));
}

function parsePriceToPence(amount) {
  if (typeof amount === 'number') return Math.round(amount * 100);
  const cleaned = String(amount).replace(/[^0-9.]/g, '');
  return Math.round(parseFloat(cleaned) * 100);
}

/** MB-4-T1: server-side amount must match catalog */
function validatePlanAmount(planId, amount) {
  const plan = getPlan(planId);
  if (!plan) return { ok: false, error: 'Invalid planId' };
  const pence = parsePriceToPence(amount);
  if (pence !== plan.pricePence) {
    return { ok: false, error: `Amount does not match plan price (${plan.price})` };
  }
  return { ok: true, plan, amountPence: pence };
}

/**
 * MB-9: membership start/end dates by plan type
 * - day: 1 calendar day (start date through end of that day)
 * - week: 7 calendar days inclusive
 * - month: 1 calendar month from start date (not fixed 30 days)
 */
function computeMembershipDates(planId, startDateInput) {
  const plan = getPlan(planId);
  if (!plan) return null;

  const start = startDateInput
    ? new Date(`${String(startDateInput).slice(0, 10)}T00:00:00`)
    : new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);

  if (plan.billingPeriod === 'month') {
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
  } else if (plan.billingPeriod === 'week') {
    end.setDate(end.getDate() + plan.durationDays - 1);
  } else {
    // day pass: same calendar day
    end.setDate(end.getDate() + Math.max(plan.durationDays - 1, 0));
  }
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start,
    endDate: end,
    billingPeriod: plan.billingPeriod,
    durationDays: plan.durationDays
  };
}

module.exports = {
  PLANS,
  getPlan,
  getAllPlans,
  validatePlanAmount,
  computeMembershipDates,
  parsePriceToPence
};
