# Payment confirmation email (MB-25)

After a successful payment, members receive a confirmation email with plan details, access dates, and links to billing and the member hub.

## When it sends

- `POST /api/confirm-payment` — when a new membership is created
- Stripe webhook `payment_intent.succeeded` — when membership is created via webhook

Only **one** email per membership (`confirmationEmailSentAt` on the document).

## Configure SMTP

Add to `backend/.env` (see `.env.example`):

```env
APP_BASE_URL=http://localhost:5001
EMAIL_FROM="Aura Athletic" <noreply@yourdomain.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
```

Set `EMAIL_ENABLED=false` to disable sending entirely.

## Development without SMTP

If `SMTP_HOST` is not set, the server **logs** the email subject and preview to the console instead of sending. Checkout still succeeds; the success page can show the confirmation message when `emailConfirmation.mode` is `console`.

## Providers

- **Gmail**: use an [App Password](https://support.google.com/accounts/answer/185833) with `smtp.gmail.com:587`
- **SendGrid**: `smtp.sendgrid.net`, user `apikey`, password = API key
- **Mailtrap** (testing): use Mailtrap SMTP credentials in `.env`
