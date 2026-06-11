/**
 * MB-18: Billing history and receipts
 */

const { getPlan } = require('./plans');
const {
  normalizeEmail,
  isValidEmail,
  escapeRegex,
  expireActiveMemberships,
  isMembershipActive
} = require('./membership');

/** Fetch Stripe receipt URL from a succeeded PaymentIntent */
async function getStripeReceiptUrl(stripe, paymentIntent) {
  if (!stripe || !paymentIntent?.latest_charge) return null;
  const chargeId =
    typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge.id;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return charge.receipt_url || null;
  } catch (err) {
    console.warn('MB-18: Could not load receipt URL:', err.message);
    return null;
  }
}

/**
 * MB-18: Combined billing history — successful memberships + failed payment events.
 */
async function listBillingHistoryByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, error: 'Invalid email address' };
  }

  const emailFilter = {
    'userDetails.email': { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') }
  };

  await expireActiveMemberships(db, emailFilter);

  const memberships = await db.collection('memberships')
    .find(emailFilter)
    .sort({ createdAt: -1 })
    .toArray();

  const failedEvents = await db.collection('billing_events')
    .find({
      type: 'payment_failed',
      email: normalized
    })
    .sort({ createdAt: -1 })
    .toArray();

  const history = [];

  memberships.forEach((m) => {
    history.push({
      id: m._id?.toString(),
      kind: 'membership',
      date: m.createdAt,
      planId: m.planId,
      planLabel: getPlan(m.planId)?.name || m.planName || m.planId,
      amount: m.amount,
      currency: (m.currency || 'gbp').toUpperCase(),
      status: m.status,
      isActive: isMembershipActive(m),
      paymentIntentId: m.paymentIntentId,
      receiptUrl: m.receiptUrl || null,
      receiptNumber: m.receiptNumber || m.paymentIntentId,
      startDate: m.startDate,
      endDate: m.endDate
    });
  });

  failedEvents.forEach((e) => {
    history.push({
      id: e._id?.toString(),
      kind: 'payment_failed',
      date: e.createdAt,
      planId: e.planId,
      planLabel: getPlan(e.planId)?.name || e.planId || 'Payment',
      amount: e.amount,
      currency: (e.currency || 'gbp').toUpperCase(),
      status: 'failed',
      isActive: false,
      paymentIntentId: e.paymentIntentId,
      receiptUrl: null,
      receiptNumber: null,
      error: e.error
    });
  });

  history.sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalPaid = history
    .filter((h) => h.kind === 'membership' && h.status !== 'failed')
    .reduce((sum, h) => sum + (h.amount || 0), 0);

  return {
    ok: true,
    email: normalized,
    count: history.length,
    totalPaid: Math.round(totalPaid * 100) / 100,
    history
  };
}

module.exports = {
  getStripeReceiptUrl,
  listBillingHistoryByEmail
};
