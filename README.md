# TLC Member Profile Verification Portal

A responsive member-verification portal backed by read-only Planning Center access, Neon review queues and audits, Twilio Verify, and optional Resend delivery.

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Local interface preview

- Search for `Timothy`, `timothy.o@gmail.com`, `07700900432`, or `IP1 3RH`.
- Verification values for Timothy: phone ending `432` and full email `timothy.o@gmail.com`.
- Use the small dot in the bottom-left corner to open staff access.
- Demo staff password: `TLC-demo-2026`

The member flow never displays a member search list or confirms whether a record exists. After a name is submitted, the interface masks the entered name using its first letter and final three letters, then asks the member to re-enter the final three phone digits and full email address. The response is identical for matches and non-matches. OTP is the final gate immediately before the member selects “This is me” and opens the editable profile. Members whose OTP does not arrive can contact the data team through a blank, no-disclosure route.

Production lets the member choose email or text-message delivery immediately before the OTP step and never displays either destination. Matching, OTP verification, per-session and per-IP limits, lockouts, encrypted audit logs, and review submissions run in server-side endpoints. No personal data is placed in URLs or query strings. Planning Center remains read-only; updates and duplicate guidance are reviewed manually, with merge and deletion performed only in Planning Center.

Production audit events have an approved 90-day retention period. A scheduled server-side cleanup must permanently remove expired events. The data-team contact address is `datateam@thelibertychurchlondon.com`.

Every member stage after the initial search includes a one-step Back control so members can correct a selection without restarting the journey.

Opening the static files locally is an interface preview; live matching and delivery require Vercel functions and configured environment variables.

## Demo architecture

- `index.html` provides the dependency-free app shell.
- `styles.css` contains the responsive member and admin layouts.
- `app.js` contains the responsive browser interface. Production member actions call `/api/member`, and staff actions call `/api/admin`.
- `api/member.js` performs server-side matching, delivery, verification and submissions.
- `api/admin.js` provides server-authenticated access to live Neon queues and audit events.
- `api/_lib.js` provides encrypted storage, Planning Center access and retention controls.

Planning Center remains the intended system of record. The production portal should fetch profiles from Planning Center and retain only member-submitted updates, confirmed duplicate links, and escalated review cases. Staff should compare active and inactive records and complete any merge or deletion manually inside Planning Center.

The Vercel project expects encrypted `pc_clientid`, `pc_secret`, and either `DATABASE_URL` or the Neon-created `tlc_DATABASE_URL` environment variable. `/api/pc-health` performs a server-only, read-only connectivity check and never returns credentials or member records. Never commit or paste secret values; if a database URL is disclosed, rotate its password and replace the Vercel value immediately.

Real OTP delivery additionally requires `RESEND_API_KEY` and `OTP_FROM_EMAIL` for email, plus `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` for text messages. Until both providers are configured and the secure server endpoints are deployed, OTP remains in demonstration mode.

TLC ID completion receipts use `SENDGRID_API_KEY`, `IDENTITY_FROM_EMAIL` (for example, `hello@penielsense.co.uk`) and optional `IDENTITY_FROM_NAME`. Resend remains a fallback. A receipt is sent once per TLC identity; failed delivery is audited and retried after the member's next submission.
