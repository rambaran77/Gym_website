# Stripe keys in `backend/.env`

The backend reads **all** Stripe keys from `backend/.env` (never hardcoded in code).

## Required for checkout

| Variable | Where to get it |
|----------|-----------------|
| `STRIPE_SECRET_KEY` | [Stripe Dashboard → API keys](https://dashboard.stripe.com/test/apikeys) → **Secret key** (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Same page → **Publishable key** (`pk_test_...`) |

Both must be from the **same** Stripe account and mode (test vs live).

## Optional (webhooks)

| Variable | Where to get it |
|----------|-----------------|
| `STRIPE_WEBHOOK_SECRET` | Stripe CLI `stripe listen` output (`whsec_...`) or Dashboard → Webhooks → signing secret |

See `docs/STRIPE-WEBHOOKS.md` for webhook setup.

## After updating `.env`

```bash
cd backend
npm start
```

Open http://localhost:5001/checkout.html — the card field should appear when `STRIPE_PUBLISHABLE_KEY` is set.

## Security

- Do not commit `.env` (it is in `.gitignore`).
- If a secret key was shared or committed, **roll the key** in the Stripe Dashboard and update `.env`.
