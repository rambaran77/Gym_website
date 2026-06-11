# Membership & Billing – Jira backlog ↔ code map

Project: **Aura Athletics** | CSV: `membership-billing-jira-epics-only.csv`, `membership-billing-jira-stories-only.csv`

## Epics

| Epic | Summary | Code / APIs |
|------|---------|-------------|
| Epic 1 | Membership plan catalog and discovery | `backend/plans.js`, `GET /api/plans`, `frontend/gym-plans.html`, `subscription.html`, `day-pass.html`, `weekly-plan.html`, `monthly-plan.html` |
| Epic 2 | Checkout and one-time payment Stripe | `frontend/checkout.html`, `POST /api/create-payment-intent`, `POST /api/confirm-payment`, `payment-success.html`, `payment-failed.html` |
| Epic 3 | Membership lifecycle backend | `backend/membership.js`, `memberships` collection, `GET /api/memberships/:email` |
| Epic 4 | Recurring billing and subscriptions | **Planned** – Stripe Subscriptions, webhooks |
| Epic 5 | Member account and billing self-service | `frontend/my-membership.html`, `auth.js`, checkout prefill (MB-16) |
| Epic 6 | Admin membership and billing operations | `frontend/admin.html`, `GET /api/admin/memberships`, `GET /api/admin/billing/stats`, `PATCH /api/admin/memberships/:id` |
| Epic 7 | Compliance security and reliability | Partial – duplicate payment guard, server amount validation |

## Stories – status in codebase

| ID | Summary | Status | Files |
|----|---------|--------|-------|
| MB-1 | Compare day/week/month plans | Done | Plan pages + `plans.js` |
| MB-2 | Plan detail pages before checkout | Done | `day-pass.html`, `weekly-plan.html`, `monthly-plan.html` |
| MB-3 | Single source of truth for plans | Done | `backend/plans.js`, `GET /api/plans` |
| MB-4 | Checkout member details and pay | Done | `checkout.html` |
| MB-5 | Order summary before payment | Done | `checkout.html` summary panel |
| MB-6 | Payment success/failure pages | Done | `payment-success.html`, `payment-failed.html` |
| MB-7 | Stripe keys from environment | Done | `.env` `STRIPE_PUBLISHABLE_KEY`, `GET /api/config/stripe` |
| MB-8 | Create active membership on payment | Done | `POST /api/confirm-payment`, `buildMembershipDocument()`, `memberships` collection `status: active` |
| MB-9 | Start/end dates by plan type | Done | `computeMembershipDates()` — day 1d, week 7d inclusive, month calendar month |
| MB-10 | Expire memberships automatically | Done | `expireActiveMemberships()` on startup, hourly job, before member/admin API reads; `POST /api/admin/expire-memberships` |
| MB-11 | List memberships by email | Done | `GET /api/memberships/:userEmail`, `GET .../summary`, `listMembershipsByEmail()` |
| MB-12 | Auto-renewal weekly/monthly | Backlog | Stripe Subscriptions |
| MB-13 | Update payment method | Backlog | Customer Portal |
| MB-14 | Cancel at period end | Backlog | |
| MB-15 | Stripe webhooks | Done | `POST /api/stripe/webhook`, `stripe-webhooks.js`, `docs/STRIPE-WEBHOOKS.md` |
| MB-16 | Login before checkout | Done | `requireMemberForCheckout()`, locked email, `assertMemberAccountForCheckout()` on payment APIs |
| MB-17 | My membership page | Done | `my-membership.html` |
| MB-18 | Billing history and receipts | Done | `GET .../billing-history`, receipt links, `billing-history.js`, `my-membership.html` |
| MB-19 | Upgrade/downgrade plan | Backlog | |
| MB-20 | Admin view all active memberships | Done | `admin.html`, `GET /api/admin/memberships`, `GET /api/admin/memberships/active`, `requireAdmin()` |
| MB-21 | Admin filter memberships | Done | Query `status`, `planId` |
| MB-22 | Admin revenue summary | Done | `/api/admin/billing/stats` |
| MB-23 | Admin manual activate/cancel | Done | `adminUpdateMembershipStatus()`, `PATCH /api/admin/memberships/:id`, Activate/Cancel in `admin.html` |
| MB-24 | Secure payment APIs | Partial | Amount validation; auth TBD |
| MB-25 | Email confirmation after payment | Done | `payment-email.js`, `notifyPaymentConfirmation()`, confirm-payment + webhook |
| MB-26 | Log failed payments | Partial | `billing_events` on `payment_intent.payment_failed` and webhook errors |
| MB-27 | QA test matrix | Backlog | See `JIRA-IMPORT-MAPPING.txt` |
| MB-3-T1 | Plan schema | Done | `backend/plans.js` |
| MB-3-T2 | GET /api/plans | Done | `server.js` |
| MB-3-T3 | Frontend uses API | Partial | `plans-api.js`, `checkout.html` |
| MB-4-T1 | Server-side amount validation | Done | `validatePlanAmount()` |
| MB-8-T1 | MongoDB indexes | Done | `server.js` connectDB |
| MB-12-T1 | Stripe Products/Prices | Backlog | |
| MB-15-T1 | Webhook endpoint | Done | `server.js` + `stripe-webhooks.js` |

## Env vars

```
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
MONGODB_URI=
```

## Role-based pages

| Role | Dashboard | Access |
|------|-----------|--------|
| **Member** | `/member-dashboard.html` | Plans, billing, schedule, purchased plan features |
| **Trainer** | `/trainer-dashboard.html` | Profile, classes, photo upload (not member billing) |
| **Admin** | `/admin.html` | Classes, memberships, stats |

Login redirects: member → member hub, trainer → trainer hub, admin → admin.

## Run

```bash
cd backend && npm start
# Member hub: http://localhost:5001/member-dashboard.html
# Trainer hub: http://localhost:5001/trainer-dashboard.html
# Plans: http://localhost:5001/api/plans
```
