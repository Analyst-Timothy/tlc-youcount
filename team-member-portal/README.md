# TLC Team Member Portal — version one

See [`../PROJECT_PHASES.md`](../PROJECT_PHASES.md) for the agreed phased web, mobile and potential church-wide delivery path.

This is the production-track project. The interactive concept remains separately in `../team-member-portal-mockup` and is not modified by this application.

## Included in v1

- Controlled sign-in boundary with Team Member, Team Lead and Talent Management roles
- Read-only rota view and calendar hand-off
- Team directory and member join requests
- Team Lead / Talent Management approval flow
- Talent Management role appointments for existing Planning Center people
- Editable, versioned team guides and per-member read/edit permissions
- Persistent audit records when a database is configured
- Planning Center kept read-only

## Run locally

From this directory:

```sh
npm install
npx vercel dev
```

Open the local URL shown by Vercel. Without environment variables it runs as a non-persistent preview. For persistent data configure `DATABASE_URL` and `SESSION_SECRET`.

## Launch configuration

- `DATABASE_URL`: Neon/Postgres connection string
- `SESSION_SECRET`: long random secret
- `pc_clientid`, `pc_secret`: Planning Center personal access credentials for server-to-server reads
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token for DOCX, PDF and CSV source-file uploads
- `PORTAL_DEMO_MODE=false`: disables preview role selection; enable only after the approved identity provider has been wired

Do not launch publicly with preview role selection enabled. Church Center OAuth or the church-approved OTP flow must establish the person ID server-side before production release.

## Data ownership

Planning Center owns people, team membership, training fields and Services schedules. This portal owns join requests, portal-only roles, documentation permissions, document versions and audit events.
