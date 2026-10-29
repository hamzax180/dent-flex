# Dent Flex — clinic website, CRM, AI receptionist & automation

A single Next.js (App Router, TypeScript) modular monolith with PostgreSQL/Prisma and a separate background worker.

> **Not production-ready for real patient data yet.** All clinic facts, prices, team details, privacy text and message
> templates are clearly-labelled placeholders. See [Release gate](#release-gate-before-real-patient-data).

## What is in here

| Area | Where |
|---|---|
| Public site (EN/TR): home, treatments, team, contact/request form, privacy, unsubscribe | `src/app/(site)` |
| Staff CRM: overview, lead inbox, lead detail, pipeline, appointments, tasks, conversations, automation, campaigns, treatments & prices, reports, settings | `src/app/crm` |
| API (validation, RBAC, idempotency, safe errors) | `src/app/api` |
| Shared lead-creation service (form, text AI and voice all use it) | `src/lib/services/leads.ts` |
| Deterministic conversion-readiness score | `src/lib/scoring.ts` |
| AI assistant + allowlisted tool gateway + dev mock | `src/lib/assistant` |
| Automation engine, consent/suppression, campaigns, provider adapters, webhooks | `src/lib/automation` |
| Durable job queue (PostgreSQL) + worker process | `src/lib/automation/queue.ts`, `src/worker/index.ts` |
| Data model & migrations | `prisma/schema.prisma`, `prisma/migrations` |
| Tests (64, unit + integration against a real test DB) | `tests/` |

### Key decisions

- **Modular monolith.** One Next.js app serves the site, the CRM and the API, so there's no separate NestJS service. The routes are thin; business rules live in `src/lib/services` and `src/lib/automation`.
- **Queue = PostgreSQL job table, no Redis.** Business events (`AutomationEvent`) and their jobs (`Job`) are written **in the same transaction** as the change that caused them (transactional outbox), so a crash can't lose `lead.created` or `appointment.confirmed`. The worker claims jobs with `FOR UPDATE SKIP LOCKED` and a 5-minute lease (a crashed worker's jobs are picked up again). Retries use exponential backoff with jitter, and jobs that keep failing go to a visible "dead" list. Idempotency comes from dedupe keys on events, enrollments, steps, tasks, deliveries and provider events. This is enough for one clinic; move to BullMQ/Redis only if volume requires it.
- **Auth.** Staff sign in with a password hashed with bcrypt (cost 12). Sessions are random tokens stored **hashed** in the database and sent as an HttpOnly, SameSite=Lax cookie (`Secure` in production) that expires after 12 hours. Every state-changing admin request must also pass a same-origin check. Login attempts are rate-limited and audited. Roles are enforced server-side in every handler (`src/lib/auth/rbac.ts`). Clinicians only see leads they own or have an appointment with, and their view of contact details is masked.
- **Appointment request ≠ appointment.** These are separate tables. Only `POST /api/admin/appointment-requests/:id/confirm` can create an appointment, and only with an authorised staff role, a real time, and an explicit "slot agreed with the patient" attestation. No AI or visitor path can confirm a booking.
- **Prices.** Stored as integer minor units with an explicit currency. A version moves Draft → Approved → Published → Archived. Published versions are immutable. The site and the AI read only through `getPublicTreatments()`, which returns the published version whose effective window covers now.

## Local setup

Requirements: Node 20+ (tested on 24), npm. PostgreSQL 16 either via Docker or the bundled embedded Postgres.

```bash
cp .env.example .env            # then edit secrets (APP_SECRET, POSTGRES_PASSWORD, …)
npm install
```

Start PostgreSQL — **either**:

```bash
docker compose up -d db         # Docker Desktop running
```

**or** (no Docker; uses the `embedded-postgres` package, data in `./.pgdata`, creates the main and test databases):

```bash
node scripts/dev-db.mjs
```

Then:

```bash
npm run db:migrate              # prisma migrate deploy
npm run db:seed                 # demo-only data: 3 demo staff, placeholder content, draft workflows/templates
npm run dev                     # http://localhost:3000  (CRM at /crm)
npm run worker                  # separate terminal: runs automation jobs
```

The seed creates `admin@dentflex.local` with the password from `SEED_ADMIN_PASSWORD`, plus `reception@dentflex.local` and `clinician@dentflex.local` with the **same** password. These are demo accounts. Change the password or deactivate them immediately on any shared environment.

In development, the Automation page has a **"Run due jobs now (dev)"** button, which processes due jobs inline if the worker isn't running.

## Commands

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit and integration tests against `TEST_DATABASE_URL` (a database name containing `test` is enforced; tables are truncated per test) |
| `npm run build` | Production build |
| `npm run worker` | Background worker (`WORKER_CONCURRENCY`, default 4) |
| `npm run db:migrate` / `db:migrate:dev` / `db:seed` | Prisma migrations / create migration / seed |

## Environment variables

See `.env.example`; every value there is a placeholder. Notes:

- `APP_SECRET` signs unsubscribe links (and the webhook fallback). Use 32+ random bytes.
- `OPENAI_API_KEY`: leave empty to use the **development mock assistant**. It is rule-based, uses the same tool gateway and published data, and the widget shows a "Development mode" banner. It never pretends a live AI call happened.
- `OPENAI_TEXT_MODEL`: the text model id. Check the current model list before choosing.
- `AI_TEXT_INPUT_USD_PER_1M`, `AI_TEXT_OUTPUT_USD_PER_1M`, `AI_VOICE_USD_PER_MINUTE`: rates used for **cost estimates**. Set them from the live pricing page (https://openai.com/api/pricing/); nothing is hard-coded. `AI_DAILY_BUDGET_USD` / `AI_MONTHLY_BUDGET_USD` make the assistant and voice refuse new work once the estimate reaches the cap.
- `EMAIL_PROVIDER`, `WHATSAPP_PROVIDER`: `console` (dev; logs a redacted line instead of sending). See [Messaging providers](#messaging-providers).
- `PROVIDER_WEBHOOK_SECRET`: HMAC secret for `/api/webhooks/providers/:provider`.
- `CLINIC_TIMEZONE` (default `Europe/Istanbul`): times are stored in UTC and displayed and scheduled in this zone. DST is handled.

## API summary

All errors have the form `{ error: { code, message, fields?, requestId } }`. Stack traces and internals are never returned.

Public: `POST /api/public/leads` (accepts an `Idempotency-Key` header and returns an opaque `reference`), `GET /api/public/treatments`, `GET /api/public/clinic-info`, `GET /api/public/faqs`, `POST /api/public/unsubscribe?t&s`, `POST /api/assistant/messages`, `POST /api/voice/session`, `GET /api/health`, `GET /api/ready`.

Staff (session + role checked in the handler): `/api/auth/login|logout`, `/api/me`, `GET /api/admin/leads`, `GET|PATCH /api/admin/leads/:id`, `POST /api/admin/leads/:id/{notes|tasks|score-override|consent}`, `POST|PATCH /api/admin/tasks[/:id]`, `POST /api/admin/appointment-requests/:id/{confirm|decline}`, `POST /api/admin/appointments/:id/{reschedule|cancel|complete|no-show}`, `POST /api/admin/treatments/:id/price-versions`, `POST /api/admin/price-versions/:id/{approve|publish|archive}`, `GET /api/admin/ai-usage`, `PUT /api/admin/settings/:key`, `GET|POST /api/admin/users`, `PATCH /api/admin/users/:id`.

Automation: `GET|POST /api/admin/automation/workflows`, `GET|PATCH /api/admin/automation/workflows/:id`, `POST /api/admin/automation/workflows/:id/{validate|simulate|publish|pause|resume|archive}`, `GET|POST /api/admin/automation/{campaigns|templates|segments|analytics|jobs}`, `POST /api/admin/automation/campaigns/:id/{preview|test-send|submit|approve|schedule|pause|resume|cancel}`, `POST /api/admin/automation/templates/:id/{submit|approve|publish|archive}`, `POST /api/admin/automation/enrollments/:id/stop`, `POST /api/admin/automation/jobs/:id/retry`. Webhooks: `POST /api/webhooks/providers/:provider`.

## Lead score

There are seven factors, worth 100 points in total: explicit appointment intent 25, self-stated timeframe 20, reachable contact 15, specific treatment 10, preferred time/channel 10, answered follow-up 10, next step requested 10.

The bands are Hot (75–100), Warm (40–74) and Low information (0–39).

- The score is computed only on the server. Each calculation saves its version, factor points and reasons.
- It is recalculated whenever a relevant field changes.
- Staff can override it, but only with an audited reason.
- Name, language, nationality, consent status, symptoms and urgency are never inputs. The test suite asserts this.

## AI assistant

- The model can only call allowlisted tools: `searchClinicFAQ`, `getPublishedTreatmentPrices`, `getClinicInfo`, `createLead`, `createAppointmentRequest`, `handoffToStaff` and `recordConversationSummary`. The server validates the arguments of every call; the model has no SQL or general database access.
- Lead creation goes through the shared service with an idempotency key per conversation.
- The visitor must tick an in-widget consent box before any lead can be created. The model cannot set this flag.
- Messages that look urgent (EN/TR patterns) skip the model entirely. They get the clinic's emergency text and a handoff.
- Transcripts are **not stored by default**: the browser sends the recent turns. Summaries are stored only if `privacy.storeTranscripts` is enabled.

### Voice (Phase 4: scaffold only, disabled)

`POST /api/voice/session` returns 503 with a text/contact fallback unless `VOICE_ENABLED=true`. The adapter (`src/lib/assistant/voice.ts`) creates a short-lived client secret on the server, so the permanent key never reaches the browser. **The request shape has not been verified against the current OpenAI Realtime docs, and there is no browser voice UI yet.**

Before enabling voice:
1. Read the current Realtime/voice docs and compare the GPT-Live option with the Realtime API.
2. Fix the client-secret request.
3. Build the WebRTC client and a server sideband connection that routes tool calls to `executeTool`.
4. Record the final duration once per session as an `AiUsageEvent` (`providerEventId` deduplicates).
5. Run the Turkish/English evaluation scenarios listed in the spec.

## Marketing automation

- **Workflows.** Workflows are validated directed acyclic graphs made of trigger, condition, delay, action and exit nodes. Draft → validate (checks the graph structure and that referenced templates are published) → dry-run against a real lead (no side effects) → publish an immutable version. Running enrollments stay pinned to the version they started on.
  - The CRM builder is a structured visual editor: a layered graph view, a node inspector, branch wiring, stop/goal rules and a JSON tab. It is not a free-form drag-and-drop canvas.
- **Prebuilt templates.** Nine are seeded, all **disabled (draft)**: new lead, consented nurture, booking abandonment, appointment reminders (48/24/2h), cancellation recovery, no-show, review request, inactive lead and campaign response.
- **Before every send** the worker re-checks: global pause, campaign paused/cancelled, enrollment stopped, a stale appointment revision (rescheduled or cancelled), message expiry, channel permission for the purpose, suppression, human hold (marketing), quiet hours (deferred, not dropped) and the weekly marketing cap.
- **Opt-outs.** Opting out by unsubscribe link (RFC 8058 one-click), a STOP reply or a complaint, or getting a hard bounce, revokes the permission, adds a suppression and blocks queued sends.
- **Campaigns.** Draft → preview (eligible / excluded / suppressed counts with reasons) → test send → submit → admin approval → schedule. The audience is snapshotted at launch, and sends are rate-spaced. Campaigns can be paused or cancelled at any time. Segments accept **only** status, language, source, utm campaign, tags, owner and appointment state; health data is rejected by the schema.
- **Reporting.** `/crm/reports` lists its definitions. Attribution uses a simple last-touch model and is labelled as a model, not as proof of causality. Email opens are not used.

## Messaging providers

`src/lib/automation/providers.ts` defines the `MessagingProvider` interface. Only the `console` adapter exists so far. To go live:

- **Email:** implement an adapter for Postmark, SES or similar. Send the `List-Unsubscribe` headers that the engine passes, verify that provider's webhook signature natively, and map its events into `providerEventSchema` (`src/lib/automation/webhooks.ts`).
- **WhatsApp:** use the **official WhatsApp Business Platform** (Meta Cloud API or a Business Solution Provider) only, with templates approved by Meta. Do not use unofficial or browser automation. Map delivery, reply and STOP events the same way.
- **SMS:** disabled. Add it only after the clinic picks a provider and reviews the policy.

## Deployment (first release: Docker Compose on a VPS)

```bash
cp .env.example .env   # production values; strong unique secrets
docker compose --profile app up -d --build    # db + web (runs migrations on start) + worker
docker compose exec web npm run db:seed       # optional, demo data only — do NOT seed production with demo staff
```

- Put a TLS reverse proxy (Caddy or nginx) in front of `web:3000`. Redirect HTTP to HTTPS and forward `X-Forwarded-For`/`Host`.
- In production, remove the `ports:` entry from `db` so Postgres is reachable only on the compose network. Use a least-privilege DB user.
- `GET /api/health` is the liveness check. `GET /api/ready` checks the database and reports overdue jobs, so alert on it.
- Security headers come from `next.config.ts`; HSTS is enabled in production.

### Backup & restore

> ⚠️ **Not yet tested.** The commands below were not run in the build session: Docker was unavailable and the embedded Postgres package doesn't include `pg_dump`. Run a full restore test before go-live.

```bash
# nightly (cron) — encrypt before it leaves the server
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc | gpg --encrypt -r ops@clinic > backup-$(date +%F).dump.gpg
# restore test into a scratch database
gpg -d backup-YYYY-MM-DD.dump.gpg > restore.dump
docker compose exec -T db createdb -U "$POSTGRES_USER" dentflex_restore_test
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d dentflex_restore_test --no-owner < restore.dump
# then compare row counts of Lead, Appointment, ConsentRecord with production
```

Keep encrypted copies off-site and set a retention period, and record the date of every restore test. Rotate `APP_SECRET`, `PROVIDER_WEBHOOK_SECRET`, `OPENAI_API_KEY` and the DB password through your secret store. Rotating `APP_SECRET` invalidates outstanding unsubscribe links (people can still opt out by contacting the clinic or replying STOP).

## Security & privacy notes

- Logs never include request bodies or contact data. Prisma query logging is off, and the dev email/WhatsApp adapter masks addresses.
- Every sensitive change writes an `AuditEvent`: logins, denied access, lead updates, score overrides, consent, price workflow, appointments, campaigns, templates, workflows, settings, users and job retries.
- Raw voice audio is never stored. Free-text inquiry messages, which may contain health details, are visible only to roles with contact access.
- **Not implemented yet:** administrator MFA, data-subject export/deletion tooling, automated retention purge, CAPTCHA/bot challenge (honeypot and rate limits only), and a separate incident-response runbook.

## Release gate before real patient data

1. Legal/KVKK review: controller details, lawful basis per purpose, final privacy notice and its version, retention periods, processor list and international transfers (OpenAI, email and WhatsApp providers, hosting), and VERBIS where applicable.
2. Replace every placeholder (clinic info, team, treatments, FAQ, templates) and set `clinic_info.isPlaceholder=false`.
3. Change or deactivate the demo accounts. Add MFA for admins.
4. Configure real providers. Test-send every template, and get WhatsApp templates approved.
5. Complete a tested backup restore, monitoring and alerting, and a written incident-response owner.
6. Clinic sign-off on emergency wording, assistant behaviour and automation timing.

## Known gaps / next steps

- Voice: scaffold only (see above). No browser UI.
- Real email and WhatsApp adapters, and native provider webhook verification.
- Workflow builder: a structured editor, not drag-and-drop. The node config is edited as JSON in the inspector.
- No end-to-end browser test suite (Playwright) yet. API and integration coverage is in `tests/`.
- No CRM screens yet for editing treatment content, FAQs or team members. They are seeded, and clinic info is editable in Settings.
- `datetime-local` inputs in the CRM use the browser's timezone; staff should work in the clinic timezone.
- The agency quotation's US dental-tourism items (US-vs-Istanbul cost calculator, travel logistics portal, photo/X-ray upload, geo-analytics) are **not** in this build. The engineering spec deliberately excludes a patient portal and clinical uploads from the MVP. They need real pricing and travel data, plus a privacy review for medical images.
