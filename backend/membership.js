/**
 * Membership lifecycle helpers (Jira Epic 3, MB-9, MB-10)
 */

const { ObjectId } = require('mongodb');
const { getPlan, computeMembershipDates } = require('./plans');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** MB-10: true if membership is active and not past endDate */
function isMembershipActive(membership) {
  if (!membership || membership.status !== 'active') return false;
  if (!membership.endDate) return true;
  return new Date(membership.endDate) >= new Date();
}

/**
 * MB-10: Expire all active memberships whose endDate has passed.
 * Runs in bulk (efficient for cron / startup / API reads).
 */
async function expireActiveMemberships(db, filter = {}) {
  const now = new Date();
  const result = await db.collection('memberships').updateMany(
    {
      status: 'active',
      endDate: { $exists: true, $lt: now },
      ...filter
    },
    { $set: { status: 'expired', expiredAt: now } }
  );

  if (result.modifiedCount > 0) {
    console.log(`MB-10: Expired ${result.modifiedCount} membership(s)`);
  }
  return result.modifiedCount;
}

/** @deprecated Use expireActiveMemberships before fetch; kept for compatibility */
async function expireMembershipsIfNeeded(db, memberships) {
  if (!memberships?.length) return memberships;
  const ids = memberships.filter(
    (m) => m.status === 'active' && m.endDate && new Date(m.endDate) < new Date()
  );
  if (ids.length) {
    await expireActiveMemberships(db, {
      _id: { $in: ids.map((m) => m._id) }
    });
  }
  return memberships.map((m) => {
    if (m.status === 'active' && m.endDate && new Date(m.endDate) < new Date()) {
      return { ...m, status: 'expired', expiredAt: new Date() };
    }
    return m;
  });
}

async function buildMembershipDocument(db, { planId, userDetails, paymentIntent }) {
  const plan = getPlan(planId);
  const dates = computeMembershipDates(planId, userDetails.startDate);
  let userId = null;

  if (userDetails.email) {
    userDetails.email = normalizeEmail(userDetails.email);
    const user = await db.collection('users').findOne({
      email: { $regex: new RegExp(`^${escapeRegex(userDetails.email)}$`, 'i') }
    });
    if (user) userId = user._id;
  }
  if (userDetails.accountUserId && !userId) {
    try {
      userId = new ObjectId(userDetails.accountUserId);
    } catch {
      /* ignore invalid id */
    }
  }

  return {
    jiraStory: 'MB-8',
    jiraStories: ['MB-8', 'MB-9', 'MB-10', 'MB-16'],
    receiptUrl: null,
    receiptNumber: null,
    jiraEpic: 'Epic 3 - Membership lifecycle backend',
    planId,
    planName: plan?.name || planId,
    userId,
    userDetails,
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    status: 'active',
    billingPeriod: dates?.billingPeriod || plan?.billingPeriod || 'unknown',
    durationDays: dates?.durationDays ?? plan?.durationDays ?? null,
    startDate: dates?.startDate || new Date(),
    endDate: dates?.endDate || null,
    createdAt: new Date()
  };
}

/** MB-10: schedule automatic expiry every hour while server runs */
function startMembershipExpiryJob(db, intervalMs = 60 * 60 * 1000) {
  const run = () => {
    expireActiveMemberships(db).catch((err) =>
      console.error('MB-10 expiry job error:', err)
    );
  };
  run();
  return setInterval(run, intervalMs);
}

/** MB-16: checkout requires a registered member (or admin) account */
async function assertMemberAccountForCheckout(db, email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, error: 'Valid email is required' };
  }

  const user = await db.collection('users').findOne({
    email: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') }
  });

  if (!user) {
    return {
      ok: false,
      error: 'Please register and log in as a member before purchasing a plan'
    };
  }

  if (user.role === 'trainer') {
    return {
      ok: false,
      error: 'Trainer accounts cannot purchase member plans. Log in with a member account.'
    };
  }

  return { ok: true, user };
}

/** MB-11: fetch all memberships for an email (newest first) */
async function listMembershipsByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, error: 'Invalid email address' };
  }

  await expireActiveMemberships(db, {
    'userDetails.email': { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') }
  });

  const memberships = await db.collection('memberships')
    .find({
      'userDetails.email': { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') }
    })
    .sort({ createdAt: -1 })
    .toArray();

  const enriched = memberships.map((m) => ({
    ...m,
    planLabel: getPlan(m.planId)?.name || m.planId,
    isActive: isMembershipActive(m)
  }));

  return {
    ok: true,
    email: normalized,
    count: enriched.length,
    memberships: enriched
  };
}

/** MB-23: admin manual activate, cancel, or expire */
async function adminUpdateMembershipStatus(db, membershipId, { status, reason }) {
  let id;
  try {
    id = new ObjectId(membershipId);
  } catch {
    return { ok: false, error: 'Invalid membership id' };
  }

  const allowed = ['active', 'cancelled', 'expired'];
  if (!allowed.includes(status)) {
    return { ok: false, error: 'Invalid status. Use active, cancelled, or expired.' };
  }

  const existing = await db.collection('memberships').findOne({ _id: id });
  if (!existing) return { ok: false, error: 'Membership not found' };

  const now = new Date();
  const note = String(reason || '').trim();
  const $set = {
    status,
    adminNote: note,
    updatedAt: now,
    lastAdminAction: status,
    lastAdminActionAt: now
  };

  if (status === 'active') {
    const endPast = !existing.endDate || new Date(existing.endDate) < now;
    if (endPast || existing.status !== 'active') {
      const dates = computeMembershipDates(existing.planId, now);
      if (dates) {
        $set.startDate = dates.startDate;
        $set.endDate = dates.endDate;
        $set.billingPeriod = dates.billingPeriod;
        $set.durationDays = dates.durationDays;
      }
    }
    $set.adminActivatedAt = now;

    await db.collection('memberships').updateOne(
      { _id: id },
      { $set, $unset: { expiredAt: '', cancelledAt: '' } }
    );
  } else if (status === 'cancelled') {
    $set.cancelledAt = now;
    await db.collection('memberships').updateOne({ _id: id }, { $set });
  } else {
    $set.expiredAt = now;
    await db.collection('memberships').updateOne({ _id: id }, { $set });
  }

  const updated = await db.collection('memberships').findOne({ _id: id });
  const plan = getPlan(updated.planId);
  return {
    ok: true,
    message:
      status === 'active'
        ? 'Membership activated'
        : status === 'cancelled'
          ? 'Membership cancelled'
          : 'Membership marked expired',
    membership: {
      ...updated,
      planLabel: plan?.name || updated.planId,
      isActive: isMembershipActive(updated),
      memberName: `${updated.userDetails?.firstName || ''} ${updated.userDetails?.lastName || ''}`.trim(),
      memberEmail: normalizeEmail(updated.userDetails?.email || '')
    }
  };
}

/** MB-8: shared create membership (confirm-payment + MB-15 webhook) */
async function createMembershipFromPaymentIntent(db, { planId, userDetails, paymentIntent, receiptUrl }) {
  const existing = await db.collection('memberships').findOne({
    paymentIntentId: paymentIntent.id
  });
  if (existing) {
    return { created: false, membership: existing };
  }

  const membership = await buildMembershipDocument(db, {
    planId,
    userDetails,
    paymentIntent
  });

  membership.jiraStories = ['MB-8', 'MB-9', 'MB-10', 'MB-16', 'MB-18', 'MB-25'];
  membership.receiptUrl = receiptUrl || null;
  membership.receiptNumber = paymentIntent.id;

  const result = await db.collection('memberships').insertOne(membership);
  return { created: true, membershipId: result.insertedId, membership };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  escapeRegex,
  isMembershipActive,
  expireActiveMemberships,
  expireMembershipsIfNeeded,
  buildMembershipDocument,
  createMembershipFromPaymentIntent,
  assertMemberAccountForCheckout,
  startMembershipExpiryJob,
  listMembershipsByEmail,
  adminUpdateMembershipStatus
};
