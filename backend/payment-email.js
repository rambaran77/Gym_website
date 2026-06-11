/**
 * MB-25: Email confirmation after successful payment
 */

const nodemailer = require('nodemailer');
const { ObjectId } = require('mongodb');
const { getPlan } = require('./plans');
const { normalizeEmail, isValidEmail } = require('./membership');

const APP_NAME = process.env.APP_NAME || 'Aura Athletic';
const APP_BASE_URL = (
  process.env.APP_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:5001'
).replace(/\/$/, '');
const EMAIL_FROM = process.env.EMAIL_FROM || `"${APP_NAME}" <noreply@auraathletic.local>`;

function isEmailEnabled() {
  if (process.env.EMAIL_ENABLED === 'false') return false;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST.trim());
}

function createTransport() {
  const host = process.env.SMTP_HOST && process.env.SMTP_HOST.trim();
  if (!host) return null;

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER && process.env.SMTP_USER.trim();
  const pass = process.env.SMTP_PASS && process.env.SMTP_PASS.trim();

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: user ? { user, pass } : undefined
  });
}

function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(amount, currency = 'gbp') {
  const sym = currency.toLowerCase() === 'gbp' ? '£' : `${currency.toUpperCase()} `;
  return `${sym}${Number(amount || 0).toFixed(2)}`;
}

function buildConfirmationContent(membership) {
  const u = membership.userDetails || {};
  const plan = getPlan(membership.planId);
  const memberName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Member';
  const planName = membership.planName || plan?.name || membership.planId;
  const amount = formatAmount(membership.amount, membership.currency);
  const start = formatDate(membership.startDate);
  const end = formatDate(membership.endDate);
  const receiptUrl = membership.receiptUrl || null;
  const myMembershipUrl = `${APP_BASE_URL}/my-membership.html`;
  const dashboardUrl = `${APP_BASE_URL}/member-dashboard.html`;

  const subject = `Payment confirmed — ${planName} at ${APP_NAME}`;

  const text = [
    `Hi ${memberName},`,
    '',
    `Thank you for your payment. Your ${planName} membership at ${APP_NAME} is now active.`,
    '',
    `Amount paid: ${amount}`,
    `Access: ${start}${end !== '—' ? ` to ${end}` : ''}`,
    receiptUrl ? `Receipt: ${receiptUrl}` : '',
    '',
    `View billing history: ${myMembershipUrl}`,
    `Member hub: ${dashboardUrl}`,
    '',
    'See you at the gym!',
    APP_NAME
  ]
    .filter(Boolean)
    .join('\n');

  const receiptBlock = receiptUrl
    ? `<p style="margin:16px 0;"><a href="${receiptUrl}" style="color:#d4af37;">View Stripe receipt</a></p>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0b10;color:#fff;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#14161c;border:1px solid rgba(212,175,55,0.25);border-radius:16px;padding:28px;">
    <p style="color:#d4af37;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px;">Payment confirmed</p>
    <h1 style="margin:0 0 12px;font-size:22px;">Welcome, ${memberName}</h1>
    <p style="color:#b7b0a1;line-height:1.6;margin:0 0 20px;">
      Your <strong style="color:#fff;">${planName}</strong> membership is active.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#b7b0a1;">
      <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">Amount</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);text-align:right;color:#fff;">${amount}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">Start</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);text-align:right;color:#fff;">${start}</td></tr>
      <tr><td style="padding:8px 0;">End</td><td style="padding:8px 0;text-align:right;color:#fff;">${end}</td></tr>
    </table>
    ${receiptBlock}
    <p style="margin:24px 0 12px;">
      <a href="${myMembershipUrl}" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#b8960c);color:#0a0b10;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px;">Billing &amp; receipts</a>
    </p>
    <p style="margin:0;font-size:13px;color:#888;">
      <a href="${dashboardUrl}" style="color:#d4af37;">Member hub</a>
    </p>
  </div>
</body>
</html>`;

  return { subject, text, html, memberName, planName };
}

async function sendPaymentConfirmationEmail(membership) {
  const to = normalizeEmail(membership.userDetails?.email);
  if (!isValidEmail(to)) {
    return { ok: false, error: 'Invalid recipient email' };
  }

  const { subject, text, html } = buildConfirmationContent(membership);

  if (!isEmailEnabled()) {
    console.log(`MB-25: Email not sent (SMTP not configured). Preview for ${to}:`);
    console.log(`  Subject: ${subject}`);
    console.log(text.split('\n').slice(0, 6).join('\n'));
    return { ok: true, mode: 'console', skipped: true, message: 'SMTP not configured — logged to console' };
  }

  const transport = createTransport();
  await transport.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html
  });

  return { ok: true, mode: 'smtp', to };
}

/**
 * Send once per membership (idempotent). Call after createMembershipFromPaymentIntent when created=true.
 */
async function notifyPaymentConfirmation(db, membershipId, membership) {
  const oid =
    membershipId instanceof ObjectId
      ? membershipId
      : new ObjectId(String(membershipId || membership._id));

  const claimed = await db.collection('memberships').findOneAndUpdate(
    { _id: oid, confirmationEmailSentAt: { $exists: false } },
    { $set: { confirmationEmailPendingAt: new Date() } },
    { returnDocument: 'before' }
  );

  if (!claimed) {
    return { sent: false, skipped: true, reason: 'already_sent_or_missing' };
  }

  const doc = claimed || (await db.collection('memberships').findOne({ _id: oid }));
  if (!doc) {
    return { sent: false, error: 'Membership not found' };
  }

  try {
    const result = await sendPaymentConfirmationEmail(doc);
    if (!result.ok) {
      await db.collection('memberships').updateOne(
        { _id: oid },
        { $unset: { confirmationEmailPendingAt: '' } }
      );
      return { sent: false, error: result.error };
    }

    await db.collection('memberships').updateOne(
      { _id: oid },
      {
        $set: {
          confirmationEmailSentAt: new Date(),
          confirmationEmailMode: result.mode || 'smtp'
        },
        $unset: { confirmationEmailPendingAt: '' },
        $addToSet: { jiraStories: 'MB-25' }
      }
    );

    console.log(`MB-25: Payment confirmation email (${result.mode}) → ${result.to || doc.userDetails?.email}`);
    return { sent: true, ...result };
  } catch (err) {
    await db.collection('memberships').updateOne(
      { _id: oid },
      { $unset: { confirmationEmailPendingAt: '' } }
    );
    console.error('MB-25: Email send failed:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = {
  isEmailEnabled,
  sendPaymentConfirmationEmail,
  notifyPaymentConfirmation,
  buildConfirmationContent
};
