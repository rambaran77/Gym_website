# Stripe webhooks (MB-15)

## Endpoint

```
POST /api/stripe/webhook
```

Requires raw JSON body and valid `Stripe-Signature` header.

## Environment

Add to `backend/.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Get this from Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret.

## Events handled

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Create active membership (same as MB-8, idempotent by `paymentIntentId`) |
| `payment_intent.payment_failed` | Log to `billing_events` collection |
| `invoice.paid` | Log (ready for future subscriptions MB-12) |
| `customer.subscription.deleted` | Cancel memberships linked by `stripeSubscriptionId` |

## Idempotency

- Each Stripe `event.id` is stored in `stripe_events` — duplicate deliveries are ignored.
- Memberships use unique `paymentIntentId` — webhook + `/api/confirm-payment` cannot double-create.

## Local testing (Stripe CLI)

```bash
# Install: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:5001/api/stripe/webhook
```

Copy the `whsec_...` secret from CLI output into `STRIPE_WEBHOOK_SECRET`, restart the server, then:

```bash
stripe trigger payment_intent.succeeded
```

## Production setup

1. Stripe Dashboard → Webhooks → Add endpoint  
2. URL: `https://your-domain.com/api/stripe/webhook`  
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`, `customer.subscription.deleted`  
4. Paste signing secret into `STRIPE_WEBHOOK_SECRET`

## Collections

- `stripe_events` — processed webhook events  
- `billing_events` — failures and billing logs (MB-26)
