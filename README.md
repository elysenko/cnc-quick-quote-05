# CNC Quick Quote

CNC Quick Quote is a web app for getting instant quotes on laser-cut sheet
metal parts. A customer uploads a DXF drawing, the backend parses the
geometry, runs it through a nesting engine (packing parts onto stock sheets)
and a pricing engine (material, cutting, bending and handling costs), and the
customer checks out through Stripe Checkout. Paid orders are confirmed by
email and tracked through to fulfillment.

- **Frontend**: Angular 19 single-page app (standalone components)
- **Backend**: NestJS 11 REST API with Prisma ORM
- **Database**: PostgreSQL
- **Object storage**: MinIO (S3-compatible) — stores uploaded DXF files, admin
  logo assets and receipts
- **Payments**: Stripe Checkout, confirmed via a signed webhook
- **Email**: Resend — transactional order-confirmation email
- **Rate limiting**: `@nestjs/throttler` with its default **in-memory**
  store (see [Rate limiting](#rate-limiting) below — there is currently no
  Redis in this stack)

## Table of contents

- [Prerequisites](#prerequisites)
- [Project layout](#project-layout)
- [Local development setup](#local-development-setup)
- [Running tests](#running-tests)
- [Docker / production build](#docker--production-build)
- [Environment variables](#environment-variables)
- [Stripe configuration](#stripe-configuration)
- [Email (Resend) configuration](#email-resend-configuration)
- [Object storage (MinIO) configuration](#object-storage-minio-configuration)
- [Rate limiting](#rate-limiting)
- [API docs & health checks](#api-docs--health-checks)

## Prerequisites

- Node.js 20.x and npm
- Docker (for PostgreSQL, and optionally a local MinIO container)
- A Stripe account (test/sandbox mode is enough for local dev)
- A Resend account, if you want to exercise order-confirmation email locally
  (optional — orders still complete without it)
- [Stripe CLI](https://docs.stripe.com/stripe-cli), if you want to receive
  webhooks locally

## Project layout

```
backend/    NestJS API — Prisma schema/migrations, DXF parsing, nesting,
            pricing, checkout, webhooks, admin settings
frontend/   Angular 19 SPA
docker-compose.yml   Local PostgreSQL (+ pgAdmin)
```

## Local development setup

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Start PostgreSQL

`docker-compose.yml` at the repo root brings up **PostgreSQL 16** and
**pgAdmin** (a Postgres UI on port 5050). It does **not** provision MinIO or
Redis — this stack does not use Redis at all (see
[Rate limiting](#rate-limiting)), and MinIO needs to be run separately (see
below).

```bash
docker-compose up -d
```

This starts Postgres on `localhost:5432` with database `app_development`,
user `postgres`, password `postgres` (as defined in `docker-compose.yml`),
and pgAdmin on `localhost:5050`.

### 3. Run a local MinIO server (optional but needed for uploads)

The app talks to MinIO through the standard `minio` SDK client
(`backend/src/integrations/minio-s3.ts`). Nothing in this repo starts a MinIO
container for you, so for local development run one yourself, for example:

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=<your-minio-access-key> \
  -e MINIO_ROOT_PASSWORD=<your-minio-secret-key> \
  minio/minio server /data --console-address ":9001"
```

The bucket (default `cnc-quick-quote`) is created automatically on first use
if it doesn't already exist.

### 4. Configure backend environment variables

Create `backend/.env` (loaded automatically by `ConfigModule.forRoot()`).
See [Environment variables](#environment-variables) for the full list and
what each one does. A minimal local `.env` looks like:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_development
PORT=3000
FRONTEND_URL=http://localhost:4200
JWT_SECRET=<your-local-jwt-secret>
APP_SECRET=<your-local-app-secret>

MINIO_ENDPOINT=http://localhost:9000
MINIO_ROOT_USER=<your-minio-access-key>
MINIO_ROOT_PASSWORD=<your-minio-secret-key>
```

Stripe and Resend credentials are **not required in `.env`** to boot the
app — see [Stripe configuration](#stripe-configuration) and
[Email (Resend) configuration](#email-resend-configuration); both are
normally entered through the Admin UI instead.

### 5. Generate the Prisma client and run migrations

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
```

(`prisma:migrate` runs `prisma migrate dev`, which applies pending
migrations and prompts for a name if you've changed `schema.prisma`.)

### 6. Seed the database

```bash
npm run prisma:seed
```

This runs `prisma/seed/seed.js`, which is an **essential seed only**: it
reads a `COLOSSUS_ACCOUNTS_JSON` environment variable (a JSON array of
`{ role, email, password, login_path }` platform-provisioned logins) and
upserts a matching `User`/`ColossusAccount` row for each entry so that login
works. It intentionally does **not** create any business/demo data —
pricing, machine and business config rows are created on first read with
sensible defaults (`backend/src/config/domain-config.service.ts`), and
materials, drawings, quotes and orders are all created by using the app. If
`COLOSSUS_ACCOUNTS_JSON` isn't set, the seed script exits with an error
rather than silently doing nothing; for local development without the
platform-injected accounts you can skip this step and create a user through
the app's own signup/auth flow instead.

### 7. Run the backend

```bash
cd backend
npm run start:dev
```

The API listens on `http://localhost:3000` by default (`PORT`), with
Swagger docs at `/api/docs`.

### 8. Run the frontend

```bash
cd frontend
npm start
```

`ng serve` runs on `http://localhost:4200`. Its dev-server proxy
(`frontend/proxy.conf.json`) forwards `/api/*` (and `/trpc/*`) to
`http://localhost:3000`, so no CORS configuration is needed in the default
setup — `FRONTEND_URL` on the backend just needs to match the origin you're
serving the SPA from.

## Running tests

Backend (Jest, unit/integration specs colocated as `*.spec.ts`):

```bash
cd backend
npm test
```

Backend lint:

```bash
cd backend
npm run lint
```

Frontend (Karma/Jasmine via Angular CLI):

```bash
cd frontend
npm test
```

Frontend lint:

```bash
cd frontend
npm run lint
```

## Docker / production build

There are two Dockerfiles, one per app, each producing a standalone image
(the root `docker-compose.yml` is for local Postgres/pgAdmin only — it does
not build or run either app image).

- **`backend/Dockerfile`**: multi-stage Node 20 build. The build stage runs
  `npm install`, `prisma generate` and `npm run build` (`nest build`). The
  runtime stage sets `NODE_ENV=production`, exposes port `3000`, and its
  entrypoint locates `schema.prisma`, runs `prisma migrate deploy` (falling
  back to `prisma db push` if needed), then starts the app with
  `npm run start:prod` (`node dist/main`). It does **not** run the seed
  script — seeding is a separate step/job in the deploy pipeline.
- **`frontend/Dockerfile`**: multi-stage build that runs `npm run build`
  (`ng build`, output at `dist/frontend/browser`) and serves the compiled
  SPA from `nginx:alpine` on port `80`.

To build and run the backend image standalone:

```bash
cd backend
docker build -t cnc-quick-quote-backend .
docker run -p 3000:3000 \
  -e DATABASE_URL=<postgres-connection-string> \
  -e JWT_SECRET=<your-jwt-secret> \
  -e APP_SECRET=<your-app-secret> \
  cnc-quick-quote-backend
```

And the frontend:

```bash
cd frontend
docker build -t cnc-quick-quote-frontend .
docker run -p 8080:80 cnc-quick-quote-frontend
```

In production, the SPA is expected to be served behind a reverse proxy (e.g.
nginx) on the same origin as the API, with `/api/` proxied through to the
backend — that's why `main.ts` only enables CORS for the configured
`FRONTEND_URL` (the `ng serve` dev workflow).

## Environment variables

All backend configuration is read by `AppConfigService`
(`backend/src/config/app-config.service.ts`) with the following precedence
for MinIO, Resend and Stripe credentials: **`process.env` first, then a
`SystemSetting` database row** (editable at runtime under Admin →
Settings), else unconfigured. A few variables (marked "env only" below) are
read directly from `process.env` and have no admin-UI equivalent.

### Core

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma (`prisma/schema.prisma`). |
| `PORT` | No (default `3000`) | Port the NestJS server listens on. |
| `NODE_ENV` | No | Set to `production` in prod; affects whether auth cookies are marked `secure`. |
| `FRONTEND_URL` | No (default `http://localhost:4200`) | Allowed CORS origin for the SPA in the `ng serve` dev workflow. |
| `PUBLIC_BASE_URL` | No (falls back to `FRONTEND_URL`) | Public origin used to build Stripe Checkout `success_url`/`cancel_url`. |
| `JWT_SECRET` | Recommended | Signs access tokens. Falls back to `APP_SECRET`, then an insecure built-in dev default — set explicitly outside local dev. |
| `APP_SECRET` | Recommended | Key material (SHA-256'd into an AES-256-GCM key) used by `SecretCryptoService` to encrypt the Stripe secret key / webhook secret stored in the database. Also a fallback for `JWT_SECRET`. Rotating or losing it makes previously-stored Stripe secrets undecryptable — the admin then just re-enters them. |

### Object storage (MinIO / S3-compatible)

| Variable | Required | Description |
| --- | --- | --- |
| `MINIO_ENDPOINT` | Yes (for uploads to work) | MinIO/S3 endpoint, e.g. `http://localhost:9000`. Accepts `http(s)://host:port`, `host:port` or `host`. |
| `MINIO_BUCKET` | No (default `cnc-quick-quote`) | Bucket used for uploaded DXF files, logos and receipts. Env only — created automatically if missing. |
| `MINIO_S3_MINIO_7_2_20_API_KEY` | One of the credential options | Combined `accessKey:secretKey` credential (the platform-injected form). |
| `MINIO_ROOT_USER` / `MINIO_ACCESS_KEY` | Alternative to the combined key | Access key, used together with the secret key below. |
| `MINIO_ROOT_PASSWORD` / `MINIO_SECRET_KEY` | Alternative to the combined key | Secret key. |

### Email (Resend)

| Variable | Required | Description |
| --- | --- | --- |
| `RESEND_API_RESEND_2_43_API_KEY` | No | Resend API key for order-confirmation email. Orders still complete when this is unset — sending is best-effort and failures are logged, not surfaced to the customer. |
| `RESEND_FROM_EMAIL` | No | Overrides the sender address. Env only; defaults to `<Company Name> <onboarding@resend.dev>`. |

### Stripe

| Variable | Required | Description |
| --- | --- | --- |
| `STRIPE_SDK_PYTHON_STRIPE_15_6_API_KEY` | No | Platform-level fallback Stripe **secret** key. Overridden by the key entered under Admin → Business → Payments. |
| `STRIPE_WEBHOOK_SECRET` | No | Platform-level fallback webhook **signing** secret for `POST /api/webhooks/stripe`. Overridden by the value entered under Admin → Business → Payments. |

The Stripe **publishable** key and the sandbox/live toggle only live in the
database (`BusinessConfig`), set via the Admin UI — there is no env var for
them. See [Stripe configuration](#stripe-configuration) below.

### Seeding

| Variable | Required | Description |
| --- | --- | --- |
| `COLOSSUS_ACCOUNTS_JSON` | Only for `npm run prisma:seed` | JSON array of platform-provisioned login accounts (`role`, `email`, `password`, `login_path`) to upsert. Not used at request time — seed-only. |

## Stripe configuration

Stripe credentials are primarily managed **through the app, not `.env`**:

1. In the running app, sign in as an admin and go to **Admin → Business →
   Payments** (`backend/src/admin/business.service.ts` /
   `backend/src/admin/admin.controller.ts`).
2. Toggle **sandbox vs. live** (`stripeSandbox`), and paste your Stripe
   **publishable key** and **secret key**. On save, the backend probes the
   secret key against the live Stripe API (`stripe.balance.retrieve()`) and
   rejects the save if it's invalid, so a bad key is caught immediately
   rather than at a customer's checkout.
3. The secret key (and the webhook secret, below) is encrypted at rest with
   AES-256-GCM (`SecretCryptoService`, keyed off `APP_SECRET`) and is never
   returned to the browser in plaintext — the settings screen only ever
   shows a masked value (e.g. `••••••••4242`).
4. If no key has been entered in the Admin UI, the backend falls back to the
   `STRIPE_SDK_PYTHON_STRIPE_15_6_API_KEY` environment variable. If neither
   is set, checkout requests fail with a 503 ("Card payments are not
   available yet...").

### Registering the webhook

The webhook endpoint is:

```
POST /api/webhooks/stripe
```

It is public (Stripe can't authenticate) and instead verifies the Stripe
`stripe-signature` header against a configured signing secret
(`backend/src/webhooks/stripe.controller.ts`). It listens for
`checkout.session.completed`, re-fetches the session from Stripe to confirm
it's actually paid, and only then creates the order and (best-effort) sends
the confirmation email.

**Local development**, using the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI prints a webhook signing secret (`whsec_...`). Paste that into
**Admin → Business → Payments → Webhook secret** in the running app (or set
it as `STRIPE_WEBHOOK_SECRET` in `backend/.env` and restart the server).

**Dashboard (staging/production)**: create an endpoint in the Stripe
Dashboard pointed at `https://<your-domain>/api/webhooks/stripe`, subscribe
it at least to `checkout.session.completed`, and paste the resulting signing
secret into Admin → Business → Payments the same way.

Without a configured webhook secret, the endpoint refuses every delivery
with a 400 rather than trusting an unverified payload.

## Email (Resend) configuration

Order-confirmation email is sent via [Resend](https://resend.com)
(`backend/src/integrations/resend-api.ts`) after a Stripe webhook creates an
order. Set `RESEND_API_RESEND_2_43_API_KEY` (env var or, if surfaced in the
Admin settings catalog, the equivalent `SystemSetting`) to enable it, and
optionally `RESEND_FROM_EMAIL` to control the `From` address. Sending is
best-effort: if Resend is unconfigured or the API call fails, the order is
still created and confirmed to the customer in-app — only the email is
skipped, and `Order.emailSentAt` stays null for later inspection.

## Object storage (MinIO) configuration

Uploaded DXF files, the admin-configured company logo, and generated
receipts are stored in MinIO (`backend/src/integrations/minio-s3.ts`).
Configure `MINIO_ENDPOINT` plus either the combined
`MINIO_S3_MINIO_7_2_20_API_KEY` (`accessKey:secretKey`) or the pair
`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` (`MINIO_ACCESS_KEY`/
`MINIO_SECRET_KEY` also work). The target bucket (`MINIO_BUCKET`, default
`cnc-quick-quote`) is created automatically on first use if it doesn't
exist. If storage is unconfigured, dependent features degrade gracefully
(e.g. a missing logo, a `ServiceUnconfiguredError` on upload) instead of
crashing the process.

## Rate limiting

The API uses `@nestjs/throttler`
(`ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }])`
in `backend/src/app.module.ts`), applied globally via a custom
`UserThrottlerGuard`. This uses Throttler's **default in-memory store** — as
the code comment states, *"this app runs single-replica and no Redis is
provisioned."* There is no Redis dependency anywhere in this codebase today;
if the app is ever scaled to multiple replicas, the in-memory store would
need to be swapped for a shared (e.g. Redis-backed) store to enforce limits
consistently across instances. The Stripe webhook route is explicitly
exempted from throttling (`@SkipThrottle()`), since Stripe's own retry
behavior shouldn't be rate-limited.

## API docs & health checks

- Swagger UI: `GET /api/docs`
- Liveness: `GET /health` and `GET /api/health` — dependency-free, always
  returns `200` if the process is up.
- Readiness: `GET /api/health/deep` — probes PostgreSQL and object storage
  individually and reports `ok`/`degraded`.
