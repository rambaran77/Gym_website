# Deploy Aura Athletic free (Render)

Free hosting + free URL: **https://aura-athletic.onrender.com**

Your own purchased domain can be added later in Render → Custom Domains.

## “Not Found” on the URL?

Plain text **Not Found** (not your gym homepage) means **no Render web service exists at that URL yet**.

1. Open [dashboard.render.com](https://dashboard.render.com) → **Services**.
2. If **aura-athletic** is missing, create it (steps below).
3. If you see a service with a **different** name, use **that** URL (e.g. `https://your-service-name.onrender.com`).
4. Do **not** use `gym-website.onrender.com` — that is an unrelated old project, not this repo.

After deploy succeeds, `https://YOUR-SERVICE.onrender.com/api/health` must return JSON like `{"ok":true,...}` — not `Not Found`.

## 1. Push code to GitHub

Code must be on GitHub: `https://github.com/Ram404-coder/Gym_Website`

## 2. Create Render account

1. Go to [render.com](https://render.com) and sign up (GitHub login is easiest).
2. **New** → **Blueprint**.
3. Connect repo **Ram404-coder/Gym_Website** (branch **main**).
4. Render reads `render.yaml` and creates the **aura-athletic** web service.
5. Click **Apply** and wait for the first deploy (Build → Deploying → Live).

### Alternative: manual Web Service (if Blueprint fails)

1. **New** → **Web Service** → connect **Gym_Website**.
2. **Root Directory:** `backend`
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. **Plan:** Free
6. **Health check path:** `/api/health`

## 3. Set environment variables

In Render → **aura-athletic** → **Environment**, add (copy from your local `backend/.env`):

| Variable | Required |
|----------|----------|
| `MONGODB_URI` | Yes — MongoDB Atlas connection string |
| `STRIPE_SECRET_KEY` | Yes for payments |
| `STRIPE_PUBLISHABLE_KEY` | Yes for checkout |
| `STRIPE_WEBHOOK_SECRET` | Yes for Stripe webhooks |
| `APP_BASE_URL` | Optional — defaults to Render URL via `RENDER_EXTERNAL_URL` |

MongoDB Atlas free tier: [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)  
Allow network access: **0.0.0.0/0** (or Render’s IPs).

## 4. Stripe webhook (production)

Stripe Dashboard → Webhooks → Add endpoint:

```
https://aura-athletic.onrender.com/api/stripe/webhook
```

Copy signing secret → `STRIPE_WEBHOOK_SECRET` on Render.

## 5. Verify

- Health: `https://aura-athletic.onrender.com/api/health`
- Site: `https://aura-athletic.onrender.com/`
- Login, checkout (test card `4242 4242 4242 4242`)

## Free tier notes

- Service **sleeps** after ~15 min idle; first visit may take 30–60 seconds.
- Upgrade to paid Render plan for always-on production.

## Custom domain (you already own one)

Render → **Settings** → **Custom Domains** → add `www.yourdomain.com`  
Update DNS at your registrar (CNAME to Render). Set `APP_BASE_URL=https://www.yourdomain.com`.
