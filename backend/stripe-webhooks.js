/**
 * MB-15: Stripe webhooks for billing events
 * MB-26: Log payment failures
 */

const { getPlan } = require('./plans');
const { createMembershipFromPaymentIntent, normalizeEmail } = require('./membership');
const { getStripeReceiptUrl } = require('./billing-history');
const { notifyPaymentConfirmation } = require('./payment-email');

function parseUserDetailsFromMetadata(metadata = {}) {
  if (metadata.userDetailsJson) {
    try {
      return JSON.parse(metadata.userDetailsJson);
    } catch {
      /* fall through */
    }
  }
  const email = metadata.userEmail || metadata.email || '';
  const fullName = (metadata.userName || '').trim().split(/\s+/);
  return {
    firstName: metadata.firstName || fullName[0] || '',
    lastName: metadata.lastName || fullName.slice(1).join(' ') || '',
    email,
    phone: metadata.phone || '',
    startDate: metadata.startDate || '',
    location: metadata.location || ''
  };
}

async function logBillingEvent(db, payload) {
  await db.collection('billing_events').insertOne({
    ...payload,
    createdAt: new Date()
  });
}

async function recordStripeEvent(db, event, processed, extra = {}) {
  await db.collection('stripe_events').updateOne(
    { eventId: event.id },
    {
      $set: {
        eventId: event.id,
        type: event.type,
        processed,
        processedAt: new Date(),
        ...extra
      }
    },
    { upsert: true }
  );
}

async function isEventProcessed(db, eventId) {
  const doc = await db.collection('stripe_events').findOne({ eventId, processed: true });
  return !!doc;
}

async function handlePaymentIntentSucceeded(db, paymentIntent, stripe) {
  if (paymentIntent.status !== 'succeeded') {
    return { skipped: true, reason: 'not succeeded' };
  }
  const planId = paymentIntent.metadata?.planId;
  if (!planId || !getPlan(planId)) {
    throw new Error(`Invalid or missing planId in payment metadata: ${planId}`);
  }
  const userDetails = parseUserDetailsFromMetadata(paymentIntent.metadata);
  if (!userDetails.email) {
    throw new Error('Missing user email in payment metadata');
  }
  const receiptUrl = stripe ? await getStripeReceiptUrl(stripe, paymentIntent) : null;
  const result = await createMembershipFromPaymentIntent(db, {
    planId,
    userDetails,
    paymentIntent,
    receiptUrl
  });
  if (result.created) {
    console.log(`MB-15: Membership ${result.membershipId} from webhook for ${userDetails.email}`);
    result.emailConfirmation = await notifyPaymentConfirmation(
      db,
      result.membershipId,
      result.membership
    );
  }
  return result;
}

async function handlePaymentIntentFailed(db, paymentIntent) {
  const userDetails = parseUserDetailsFromMetadata(paymentIntent.metadata);
  await logBillingEvent(db, {
    jiraStory: 'MB-15',
    type: 'payment_failed',
    paymentIntentId: paymentIntent.id,
    planId: paymentIntent.metadata?.planId || null,
    email: normalizeEmail(userDetails.email),
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    error: paymentIntent.last_payment_error?.message || 'Payment failed'
  });
  console.warn(`MB-15: Payment failed ${paymentIntent.id} — ${userDetails.email}`);
  return { logged: true };
}

async function handleInvoicePaid(db, invoice) {
  await logBillingEvent(db, {
    jiraStory: 'MB-15',
    type: 'invoice_paid',
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription || null,
    customerEmail: invoice.customer_email || null,
    amount: (invoice.amount_paid || 0) / 100,
    currency: invoice.currency
  });
  return { logged: true };
}

async function handleSubscriptionDeleted(db, subscription) {
  const result = await db.collection('memberships').updateMany(
    { stripeSubscriptionId: subscription.id, status: 'active' },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'stripe_subscription_deleted' } }
  );
  await logBillingEvent(db, {
    jiraStory: 'MB-15',
    type: 'subscription_deleted',
    subscriptionId: subscription.id,
    membershipsUpdated: result.modifiedCount
  });
  return { membershipsUpdated: result.modifiedCount };
}

/**
 * Process a verified Stripe event (idempotent).
 */
async function processStripeEvent(db, event, stripe) {
  if (await isEventProcessed(db, event.id)) {
    return { duplicate: true, eventId: event.id };
  }

  let outcome = { handled: false };

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        outcome = await handlePaymentIntentSucceeded(db, event.data.object, stripe);
        break;
      case 'payment_intent.payment_failed':
        outcome = await handlePaymentIntentFailed(db, event.data.object);
        break;
      case 'invoice.paid':
        outcome = await handleInvoicePaid(db, event.data.object);
        break;
      case 'customer.subscription.deleted':
        outcome = await handleSubscriptionDeleted(db, event.data.object);
        break;
      default:
        outcome = { skipped: true, type: event.type };
    }

    await recordStripeEvent(db, event, true, { outcome });
    return { ok: true, eventId: event.id, type: event.type, outcome };
  } catch (err) {
    await recordStripeEvent(db, event, false, { error: err.message });
    await logBillingEvent(db, {
      jiraStory: 'MB-15',
      type: 'webhook_handler_error',
      eventId: event.id,
      eventType: event.type,
      error: err.message
    });
    throw err;
  }
}

function buildPaymentIntentMetadata(planId, userDetails = {}) {
  const safe = {
    firstName: userDetails.firstName || '',
    lastName: userDetails.lastName || '',
    email: userDetails.email || '',
    phone: userDetails.phone || '',
    startDate: userDetails.startDate || '',
    location: userDetails.location || ''
  };
  let userDetailsJson = JSON.stringify(safe);
  if (userDetailsJson.length > 500) {
    userDetailsJson = JSON.stringify({ email: safe.email, startDate: safe.startDate });
  }
  return {
    planId: String(planId),
    userEmail: safe.email,
    userName: `${safe.firstName} ${safe.lastName}`.trim(),
    userDetailsJson
  };
}

module.exports = {
  processStripeEvent,
  buildPaymentIntentMetadata,
  parseUserDetailsFromMetadata,
  logBillingEvent
};
