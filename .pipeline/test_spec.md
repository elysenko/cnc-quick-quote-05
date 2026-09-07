# Test Specification

> **WARNING — `.pipeline/surface.json` is stale.** The committed file contains only the greenfield
> scaffold surface (`GET /health`, `GET /trpc/users.findAll`, `GET /trpc/users.findById`) and the
> scaffold `testIds` (`home-title`, `users-loading`, `users-error`, `users-list`). It does **not**
> describe the CNC Quick Quote surface. The API surface below is therefore derived from the
> **Surface contract in `.pipeline/tasks.md`** (which is binding: NestJS 11 + tRPC + Prisma 6 +
> PostgreSQL, *not* the spec's FastAPI/Python stack) cross-checked against `requirements/spec.md`
> (absent from the tree; the spec text supplied to this agent was used instead).
> `backend_agent` and `ui_agent` are tasked with appending the real routes/components/testIds to
> `surface.json`; case [API-289] asserts that reconciliation happened, and [UI-136]/[UI-137] assert
> the scaffold stubs were removed.
>
> **Stack translation.** Where the spec says FastAPI `POST /api/quotes`, the implementation exposes
> tRPC `quotes.create` over `POST /trpc/quotes.create`. Status codes below are stated as HTTP; the
> tRPC equivalents are `UNAUTHORIZED`→401, `FORBIDDEN`→403, `BAD_REQUEST`/zod-fail→422 (the tester
> may assert the tRPC error `code` instead of the numeric status where the batch link flattens it),
> `CONFLICT`→409, `PRECONDITION_FAILED`→503.

## Coverage summary
- Total cases: 470 (289 API, 138 UI/journey, 43 data-integrity)
- API endpoints covered: 45 / 45 real endpoints — 34 tRPC procedures + 9 REST routes, plus the 2 `admin.settings.*` tRPC aliases covered jointly with their `GET`/`PATCH /api/admin/settings` REST equivalents. (`surface.json` lists only 3 scaffold routes — see warning above; 2 of those 3 are scheduled for deletion and are covered under **Out of scope**.)
- User journeys covered: 22

### Reference fixtures
All API and unit cases below are written against these seeded fixtures. The tester must create them
in `beforeEach` (or a seeded test database) rather than relying on `prisma/seed/seed.js`, which is
constrained to essential rows only.

| Fixture | Value |
| --- | --- |
| `PricingConfig` (id=1) | `setupFee=25.0000`, `costPerLinearFoot=3.5000`, `perSheetCost=40.0000`, `handlingFee=10.0000`, `costPerBend=1.5000`, `minimumOrder=75.0000` |
| `PricingConfig` variant **P-LOW** | `setupFee=5`, `costPerLinearFoot=1`, `perSheetCost=2`, `handlingFee=1`, `costPerBend=0.5`, `minimumOrder=75` (used for minimum-clamp cases) |
| `MachineConfig` (id=1) | `minQuantity=1`, `maxQuantity=500`, `maxUploadBytes=5242880`, `allowedExtensions=["dxf"]`, `sheetSpacingMm=5`, `sheetMarginMm=10`, `animationSpeed=300` |
| `Material` **M-STEEL** | `name="Mild Steel 16ga"`, `thicknessMm=1.5`, `sheetWMm=1219`, `sheetHMm=2438`, `costMultiplier=1.2500`, `isActive=true` |
| `Material` **M-OLD** | same dims, `costMultiplier=1.0000`, `isActive=false` |
| `ShippingMethod` **S-FLAT** | `kind="flat"`, `rate=15.0000`, `estDays=5`, `isActive=true` |
| `ShippingMethod` **S-SHEET** | `kind="per_sheet"`, `rate=8.0000`, `estDays=3`, `isActive=true` |
| Users | **U-ADMIN** (`role=ADMIN`), **U-CUST** (`role=USER`), **U-OTHER** (`role=USER`, owns nothing), **U-MGR** (`role=MANAGER`) |
| DXF fixtures (`backend/test/fixtures/`) | `rect_100x50.dxf` (4×`LINE`, cut 300 mm, bbox 100×50, mm) · `circle_r10.dxf` (`CIRCLE` r=10, cut ≈62.832 mm) · `bulge_semicircle.dxf` (`LWPOLYLINE`, bulge=1 over a 100 mm chord, cut ≈157.080 mm) · `inch_square.dxf` (`$INSUNITS=1`, 1″ square → cut 101.6 mm, bbox 25.4×25.4) · `unitless_square.dxf` (`$INSUNITS=0`, 10-unit square → cut 40 mm, `detectedUnits="mm"`) · `empty.dxf` (valid header, no entities) · `corrupt.bin` (random bytes) · `spline_only.dxf` (one `SPLINE`) · `mixed_skipped.dxf` (rect + 1 `SPLINE` + 1 `INSERT`) · `zero_area.dxf` (single horizontal `LINE`) · `big_part.dxf` (bbox 1300×200) |
| Tolerance | Flattened-length assertions use `sag=0.05 mm`; assert within **±0.5 %** of the analytic value, never exact equality. |

## API tests

### `GET /health`
- **Happy path**: [API-001] unauthenticated `GET /health` → `200`, body has a status field; this is the Colossus deploy probe and must never require auth or a database.
- **Validation failures**: n/a.
- **Auth failures**: [API-002] with a garbage `Authorization: Bearer xxx` header still → `200` (liveness must not depend on token validity).
- **Idempotency / edge cases**: [API-003] with Postgres stopped, `/health` still → `200` (liveness ≠ readiness).

### `GET /api/health/deep`
- **Happy path**: [API-004] → `200`, body reports `postgres` and `minio` individually plus an overall status; both `ok` when infra is up.
- **Validation failures**: n/a.
- **Auth failures**: [API-005] public route — unauthenticated → `200`, not `401`.
- **Idempotency / edge cases**: [API-006] MinIO credentials unset (`resolveConfig` → null) → overall status degraded/`503`, `minio` entry reports unconfigured, and the `postgres` entry still reports `ok` (one dependency failing must not mask the other). [API-007] Postgres `SELECT 1` throwing → overall degraded with `postgres: error`, response still returns within 5 s (probe must be timeout-bounded, not hang).

### `POST /trpc/auth.register`
- **Happy path**: [API-008] `{email:"new@x.io", password:"Str0ng!pass"}` on an empty `User` table → `200`, body `{user:{id,email,role:"ADMIN"}, accessToken}`, `Set-Cookie` refresh cookie with `HttpOnly`, `SameSite=Strict`, `Path=/`, ~30-day `Max-Age`. [API-009] second registration with a non-empty `User` table → `role:"USER"`.
- **Validation failures**: [API-010] malformed email `"nope"` → `422` with a `fieldErrors.email` entry. [API-011] password shorter than the configured minimum → `422` with `fieldErrors.password`. [API-012] missing `password` key entirely → `422`. [API-013] `email` differing only by case from an existing user (`NEW@x.io`) → `409` (email comparison is case-insensitive).
- **Auth failures**: n/a (public).
- **Idempotency / edge cases**: [API-014] duplicate email → `409` and **no** second `User` row is written. [API-015] response body never contains `passwordHash` or the raw refresh token. [API-016] the stored hash is a `bcryptjs` hash at 10 rounds (`$2[aby]$10$` prefix) and is not the plaintext. [API-017] 11 registration attempts in one minute from one IP → the 11th returns `429`.

### `POST /trpc/auth.login`
- **Happy path**: [API-018] correct credentials for **U-CUST** → `200`, `{accessToken, user:{role:"USER"}}` + refresh cookie; the JWT decodes to `sub=U-CUST.id`, `role`, and an `exp` ~15 min out.
- **Validation failures**: [API-019] empty body → `422`.
- **Auth failures**: [API-020] correct email, wrong password → `401` and the error message does **not** disclose that the email exists. [API-021] unknown email → `401` with an identical message and comparable response time (no user enumeration). 
- **Idempotency / edge cases**: [API-022] two successive logins mint two distinct refresh rows; the first refresh token still works (login does not revoke prior sessions). [API-023] 11 logins/min → `429`.

### `POST /trpc/auth.refresh`
- **Happy path**: [API-024] request carrying a valid refresh cookie → `200`, a new `accessToken`, a **new** refresh cookie whose value differs from the old one.
- **Validation failures**: [API-025] no cookie present → `401`.
- **Auth failures**: [API-026] token whose `expiresAt` is in the past → `401`. [API-027] token whose `revokedAt` is set → `401`. [API-028] a syntactically valid but unknown random token → `401`. [API-029] the refresh cookie belonging to a user row that was deleted → `401`, no 500.
- **Idempotency / edge cases**: [API-030] **rotation**: after a successful refresh, replaying the *old* token → `401`, and the old `RefreshToken` row has `revokedAt` set. [API-031] the DB stores the SHA-256 hash, never the raw token (`RefreshToken.tokenHash !== rawToken`).

### `POST /trpc/auth.logout`
- **Happy path**: [API-032] authenticated logout → `200`, refresh cookie cleared (`Max-Age=0`), and the presented refresh row has `revokedAt` set.
- **Validation failures**: n/a.
- **Auth failures**: [API-033] unauthenticated → `401`.
- **Idempotency / edge cases**: [API-034] logout twice → second call `200` or `401` but never `500`, and no extra rows mutate. [API-035] after logout, `auth.refresh` with the same cookie → `401`.

### `POST /trpc/auth.me` (`auth.me`)
- **Happy path**: [API-036] valid access token → `200` `{id, email, role}`.
- **Validation failures**: n/a.
- **Auth failures**: [API-037] no token → `401`. [API-038] expired access token → `401`. [API-039] token signed with the wrong secret → `401`. [API-040] token with a tampered `role: "ADMIN"` payload but an invalid signature → `401` (never trusted).
- **Idempotency / edge cases**: [API-041] response contains no `passwordHash`.

### `POST /api/drawings` (REST, multipart)
- **Happy path**: [API-042] **U-CUST** uploads `rect_100x50.dxf` → `200` with `{id, geometry.polylines, bboxWMm:100, bboxHMm:50, cutLengthMm:300, entityCount:4, skippedEntities:[], detectedUnits:"mm"}`; a `Drawing` row exists with `objectKey` matching `^drawings/<U-CUST.id>/[0-9a-f-]{36}\.dxf$`; the object is retrievable from MinIO and byte-identical to the upload. [API-043] `mixed_skipped.dxf` → `200` with `cutLengthMm≈300` and `skippedEntities` listing `SPLINE` and `INSERT` with counts.
- **Validation failures** (the rejection **order** is itself under test): [API-044] `part.txt` (extension not in `allowedExtensions`) → `422` *before* the body is fully read and with nothing written to MinIO. [API-045] a `.dxf` of `maxUploadBytes + 1` bytes → `422`, counted while streaming, `putObject` never called, no `Drawing` row. [API-046] a **6 MB `.txt`** → `422` citing the *extension*, not the size (extension check precedes size check). [API-047] `corrupt.bin` renamed to `.dxf` → `422` carrying the parser message, no MinIO object, no `Drawing` row. [API-048] `empty.dxf` → `422` (zero supported entities). [API-049] `spline_only.dxf` → `422` (zero *supported* entities even though the file parses). [API-050] `zero_area.dxf` → `422` (zero-area bbox). [API-051] request with no file part → `422`.
- **Auth failures**: [API-052] unauthenticated → `401`, and the `401` is returned before any extension/size/parse work occurs.
- **Idempotency / edge cases**: [API-053] `inch_square.dxf` → `cutLengthMm≈101.6`, `bboxWMm≈25.4`, `detectedUnits:"in"` (×25.4 applied). [API-054] `unitless_square.dxf` → `cutLengthMm≈40`, `detectedUnits:"mm"` (the `$INSUNITS=0` → mm default). [API-055] the same file uploaded twice creates two `Drawing` rows with **different** `objectKey`s (no clobbering). [API-056] 21 uploads/min → `429`. [API-057] MinIO unconfigured → `503` `ServiceUnconfiguredError`, no `Drawing` row (parse succeeded but storage did not).

### `GET /api/drawings/:id/geometry` (REST)
- **Happy path**: [API-058] owner → `200` with the flattened `polylines` array; each polyline is an array of `[x,y]` pairs in mm.
- **Validation failures**: [API-059] non-UUID `:id` → `422` or `404`, never `500`.
- **Auth failures**: [API-060] unauthenticated → `401`. [API-061] **U-OTHER** requesting **U-CUST**'s drawing → `403` (or `404` if the surface hides existence — assert one and pin it), and the body leaks no geometry.
- **Idempotency / edge cases**: [API-062] unknown id → `404`. [API-063] two identical requests return byte-identical geometry (cached response is not stateful).

### `POST /trpc/drawings.get` / `drawings.list`
- **Happy path**: [API-064] `drawings.get({id})` as owner → `200` with metadata (filename, sizeBytes, bbox, cutLengthMm, entityCount, skippedEntities, detectedUnits). [API-065] `drawings.list()` as **U-CUST** returns only **U-CUST**'s drawings, newest first.
- **Validation failures**: [API-066] `drawings.get({})` (missing id) → `422`.
- **Auth failures**: [API-067] unauthenticated → `401` for both. [API-068] `drawings.get` on another user's drawing → `403`.
- **Idempotency / edge cases**: [API-069] `drawings.list()` for a user with zero drawings → `200` with an empty array, not `404`.

### `POST /trpc/bends.list`
- **Happy path**: [API-070] owner lists bends for a drawing with 3 bends → `200`, 3 items each with `sx,sy,ex,ey,angleDeg,direction`.
- **Validation failures**: [API-071] missing `drawingId` → `422`.
- **Auth failures**: [API-072] unauthenticated → `401`. [API-073] **U-OTHER** → `403`.
- **Idempotency / edge cases**: [API-074] drawing with no bends → `200` empty array.

### `POST /trpc/bends.create`
- **Happy path**: [API-075] `{drawingId, sx:0, sy:0, ex:100, ey:0, angleDeg:90, direction:"up"}` → `200` with the created row; a `BendLine` row exists linked to the drawing.
- **Validation failures**: [API-076] `angleDeg:-1` → `422`. [API-077] `angleDeg:181` → `422`. [API-078] `angleDeg:0` → `200` (inclusive lower bound). [API-079] `angleDeg:180` → `200` (inclusive upper bound). [API-080] `direction:"sideways"` → `422`. [API-081] `direction:"UP"` → `422` (case-sensitive enum) unless the surface normalises — pin the chosen behaviour. [API-082] non-numeric `sx:"abc"` → `422`. [API-083] missing `angleDeg` → `422`.
- **Auth failures**: [API-084] unauthenticated → `401`. [API-085] creating a bend on **U-OTHER**'s drawing → `403` and no row is written.
- **Idempotency / edge cases**: [API-086] after a create, the MinIO object for the drawing is **byte-identical** to the original upload (bends never mutate the stored DXF). [API-087] after a create, any `draft` quote referencing that drawing is marked stale / flagged for recalculation.

### `POST /trpc/bends.update`
- **Happy path**: [API-088] change `angleDeg` 90→45 and `direction` up→down → `200`, row reflects both.
- **Validation failures**: [API-089] `angleDeg:200` → `422` and the stored row is **unchanged**. [API-090] unknown bend id → `404`.
- **Auth failures**: [API-091] unauthenticated → `401`. [API-092] **U-OTHER** updating **U-CUST**'s bend → `403`, row unchanged.
- **Idempotency / edge cases**: [API-093] updating with the identical payload twice → `200` both times, single row, no duplicate.

### `POST /trpc/bends.delete`
- **Happy path**: [API-094] owner deletes → `200`, `bends.list` no longer returns it.
- **Validation failures**: [API-095] unknown id → `404`.
- **Auth failures**: [API-096] unauthenticated → `401`. [API-097] **U-OTHER** → `403`, row still present.
- **Idempotency / edge cases**: [API-098] deleting the same id twice → second call `404`, never `500`. [API-099] deleting the parent `Drawing` cascades and removes its `BendLine` rows.

### `POST /trpc/materials.list`
- **Happy path**: [API-100] authenticated **U-CUST** → `200` returning **M-STEEL** only; **M-OLD** (`isActive=false`) is absent; each item carries `name, thicknessMm, sheetWMm, sheetHMm`.
- **Validation failures**: n/a.
- **Auth failures**: [API-101] unauthenticated → `401`.
- **Idempotency / edge cases**: [API-102] the customer-facing payload does **not** expose `costMultiplier` (pricing input, not customer data) — assert the field is absent. [API-103] zero active materials → `200` empty array.

### `POST /trpc/quotes.create`
- **Happy path**: [API-104] drawing `rect_100x50` (cut 300 mm/part), 2 bends/part, `M-STEEL`, `quantity=10` → `200` with `cutLengthMm=3000` (300×10), `bendCount=20` (2×10), `sheetCount`, `utilization`, `nestingJson`, `breakdownJson`, `totalCents`, `status:"draft"`; a `Quote` row is persisted **with a non-null `pricingSnapshotJson`** containing the six pricing fields and the material `costMultiplier`. [API-105] the returned `totalCents` equals the pricing function applied to the same inputs (cross-check against [DATA-013]).
- **Validation failures**: [API-106] `quantity=0` → `422` and the message states the min. [API-107] `quantity=-5` → `422`. [API-108] `quantity=null` → `422`. [API-109] `quantity` omitted → `422`. [API-110] `quantity=501` (`maxQuantity=500`) → `422` stating the limit `500`. [API-111] `quantity=1` and `quantity=500` → `200` (inclusive bounds). [API-112] `quantity=1.5` → `422` (integer required). [API-113] `materialId` of **M-OLD** (inactive) → `422`. [API-114] unknown `materialId` → `422`. [API-115] `big_part.dxf` (1300 mm wide vs 1219 mm sheet) → `422` surfacing `PartTooLargeError`, and **no** `Quote` row is written. [API-116] `drawingId` omitted → `422`.
- **Auth failures**: [API-117] unauthenticated → `401`. [API-118] quoting **U-OTHER**'s drawing → `403`, no row written.
- **Idempotency / edge cases**: [API-119] **snapshot immutability** — create a quote, then `admin.pricing.put` doubling every rate, then `quotes.get` the original: `totalCents`, `breakdownJson` and `pricingSnapshotJson` are byte-identical to the pre-change values. [API-120] a quote created after the change reflects the new rates (proving the change did take effect). [API-121] deactivating **M-STEEL** after the quote exists leaves `quotes.get` fully renderable (no join failure). [API-122] 31 quote creations/min → `429`.

### `POST /trpc/quotes.list`
- **Happy path**: [API-123] **U-CUST** with 3 quotes → `200` returning exactly those 3, plus a total count for pagination. [API-124] `{status:"draft"}` filters to drafts only. [API-125] `{status:"ordered"}` returns only ordered quotes. [API-126] `{page:2, pageSize:2}` on 3 quotes returns 1 item. [API-127] `{sort:"total_desc"}` orders by `totalCents` descending.
- **Validation failures**: [API-128] `status:"bogus"` → `422`. [API-129] `page:0` or `page:-1` → `422`. [API-130] `pageSize:100000` → `422` or is clamped to the documented max (pin one).
- **Auth failures**: [API-131] unauthenticated → `401`.
- **Idempotency / edge cases**: [API-132] **U-OTHER**'s quotes never appear in **U-CUST**'s list even with a crafted filter. [API-133] empty result → `200` empty array with `total: 0`.

### `POST /trpc/quotes.get`
- **Happy path**: [API-134] owner → `200` with breakdown, nesting, sheet count, utilisation and the material snapshot.
- **Validation failures**: [API-135] unknown id → `404`.
- **Auth failures**: [API-136] unauthenticated → `401`. [API-137] **U-OTHER** → `403`.
- **Idempotency / edge cases**: [API-138] **U-ADMIN** fetching another user's quote via `quotes.get` → `403` (customer surface is owner-scoped even for admins; admin access goes through `admin.orders.list`).

### `POST /trpc/checkout.get`
- **Happy path**: [API-139] owner of a `draft` quote → `200` `{material:{name,thicknessMm}, quantity, totalCents}`.
- **Validation failures**: [API-140] unknown `quoteId` → `404`.
- **Auth failures**: [API-141] unauthenticated → `401`. [API-142] **U-OTHER** → `403`.
- **Idempotency / edge cases**: [API-143] a quote already `ordered` → `409` (or a clearly-flagged already-ordered payload — pin one) rather than allowing a second purchase.

### `POST /trpc/checkout.shippingMethods`
- **Happy path**: [API-144] quote with `sheetCount=3`, both fixtures active → `200` with **S-FLAT** at `costCents=1500` and **S-SHEET** at `costCents=2400` (`8.00 × 3`), each with `estDays`.
- **Validation failures**: [API-145] missing `quoteId` → `422`.
- **Auth failures**: [API-146] unauthenticated → `401`. [API-147] **U-OTHER**'s quote → `403`.
- **Idempotency / edge cases**: [API-148] **no active shipping methods** → `409` (never `200` with an empty list — an unpriced order must be impossible). [API-149] inactive methods are excluded from an otherwise-populated list. [API-150] `sheetCount=1` makes per-sheet cost equal the flat rate arithmetic (`8.00 × 1 = 800`), guarding an off-by-one in the multiplier.

### `POST /trpc/checkout.createSession`
- **Happy path**: [API-151] owner + valid Stripe config → `200` with a Stripe-hosted `url`; the mocked Stripe call received line items totalling `quote.totalCents + shippingCostCents`, `success_url = {PUBLIC_BASE_URL}/checkout/{quoteId}/payment?session_id={CHECKOUT_SESSION_ID}` and `cancel_url = {PUBLIC_BASE_URL}/checkout/{quoteId}/review?status=cancelled`. [API-152] `BusinessConfig.stripeSandbox=true` causes the test key to be selected, `false` the live key.
- **Validation failures**: [API-153] missing/unknown `shippingMethodId` → `422`. [API-154] a `shippingMethodId` that is inactive → `422`.
- **Auth failures**: [API-155] unauthenticated → `401`. [API-156] **U-OTHER** → `403`, no Stripe call made.
- **Idempotency / edge cases**: [API-157] Stripe client throws a timeout/connection error → `502` and **no `Order` row** exists. [API-158] Stripe key unresolved (`resolveConfig` → null, no `BusinessConfig` fallback) → `503` `ServiceUnconfiguredError`, no order. [API-159] session creation does not mutate the quote's `status` (still `draft` until payment confirms). [API-160] 11 checkout calls/min → `429`.

### `POST /trpc/checkout.status`
- **Happy path**: [API-161] webhook already processed → `200` reporting `paid` and the existing `orderId`.
- **Validation failures**: [API-162] missing `quoteId` → `422`.
- **Auth failures**: [API-163] unauthenticated → `401`. [API-164] **U-OTHER** → `403`.
- **Idempotency / edge cases**: [API-165] **reconciliation** — webhook never delivered, Stripe session mock returns `payment_status:"paid"` → the call creates the `Order` and flips the quote to `ordered`. [API-166] calling `checkout.status` **and** delivering the webhook (in either order) yields **exactly one** `Order` row — both paths share one idempotent creation routine. [API-167] session `payment_status:"unpaid"` → `200` reporting pending, **no** order created. [API-168] polling repeatedly while unpaid never creates an order and never errors.

### `POST /api/webhooks/stripe` (REST, public, raw body)
- **Happy path**: [API-169] a fixture `checkout.session.completed` event signed with the configured webhook secret → `2xx`; the session is **re-fetched** from Stripe, `payment_status === "paid"` is asserted, an `Order` row is created with `orderNumber`, `confirmationNumber`, `shippingCostCents`, `shippingAddressJson`, `totalCents`, `stripeSessionId`, `stripePaymentIntent`, and the linked quote flips to `ordered`.
- **Validation failures**: [API-170] tampered signature header → `400`, logged, **no** `Order`, **no** `StripeEvent`, quote still `draft`. [API-171] valid signature computed over a *modified* body → `400` (raw-body integrity — proves the JSON body parser is excluded from this route). [API-172] missing `stripe-signature` header → `400`. [API-173] an event type the handler does not care about (e.g. `payment_intent.created`) → `2xx` no-op, no order.
- **Auth failures**: [API-174] the route is public — a request with **no** session/bearer still processes normally (`2xx`), i.e. `JwtAuthGuard` does not cover it.
- **Idempotency / edge cases**: [API-175] the **same `event_id` delivered twice** → both `2xx`, exactly one `Order` row, one `StripeEvent` row. [API-176] two concurrent deliveries of the same event → still exactly one order (unique constraint on `StripeEvent.eventId` is the guard, not a read-then-write race). [API-177] `payment_status:"unpaid"` on the re-fetched session → `2xx` acknowledged, **no** order, quote still `draft` (a decline creates nothing). [API-178] the handler responds `2xx` **before** the Resend email completes (email is out-of-band); assert the response is not blocked by a 5 s email stub. [API-179] webhook secret unconfigured → `400`/`503` with no state change, never `500`.

### `POST /trpc/orders.list`
- **Happy path**: [API-180] **U-CUST** with 2 orders → `200` with both, newest first, each carrying `orderNumber`, `totalCents`, `status`, `createdAt`. [API-181] `{page:2,pageSize:1}` returns the second order only.
- **Validation failures**: [API-182] `page:0` → `422`.
- **Auth failures**: [API-183] unauthenticated → `401`.
- **Idempotency / edge cases**: [API-184] **U-OTHER**'s orders never appear. [API-185] zero orders → `200` empty array.

### `POST /trpc/orders.get`
- **Happy path**: [API-186] owner → `200` with `orderNumber`, `confirmationNumber`, customer email, `shippingAddressJson`, estimated delivery date (derived from `ShippingMethod.estDays`), the company contact block from `BusinessConfig`, and a presigned receipt URL.
- **Validation failures**: [API-187] unknown id → `404`.
- **Auth failures**: [API-188] unauthenticated → `401`. [API-189] **U-OTHER** → `403`.
- **Idempotency / edge cases**: [API-190] **email-failure resilience** — order whose `emailSentAt` is `null` still returns the complete payload (nothing is gated on the email). [API-191] the presigned URL carries an expiry and is not a raw permanent MinIO path. [API-192] the payload never exposes decrypted Stripe secrets.

### `GET /api/orders/:id/receipt` (REST, stream)
- **Happy path**: [API-193] owner → `200` with a non-empty body, a `Content-Type` matching the chosen receipt format, and a `Content-Disposition` filename containing the order number; the body contains the order number, line items and total.
- **Validation failures**: [API-194] unknown id → `404`.
- **Auth failures**: [API-195] unauthenticated → `401`. [API-196] **U-OTHER** → `403` with an empty body (no partial stream leaked before the guard).
- **Idempotency / edge cases**: [API-197] two consecutive downloads return identical content. [API-198] MinIO unavailable (if the receipt is stored rather than generated) → `503`, not a truncated `200`.

### `POST /trpc/admin.materials.list` / `.create` / `.update`
- **Happy path**: [API-199] `admin.materials.list` as **U-ADMIN** returns **both** active and inactive materials with an `isActive` flag (unlike the customer `materials.list`). [API-200] `.create` with valid fields → `200`, row persisted, appears in `materials.list` for customers. [API-201] `.update` setting `isActive:false` → `200`; the material disappears from customer `materials.list` but the row still exists. [API-202] `.update` changing `costMultiplier` → `200` and existing quotes' snapshots are unaffected (see [API-119]).
- **Validation failures**: [API-203] `thicknessMm:0` or negative → `422`. [API-204] `sheetWMm:-1` → `422`. [API-205] `costMultiplier:"abc"` → `422`. [API-206] empty `name` → `422`. [API-207] `.update` on an unknown id → `404`.
- **Auth failures**: [API-208] unauthenticated → `401` on all three. [API-209] **U-CUST** → `403` on all three. [API-210] **U-MGR** → `403` (MANAGER is treated as a non-admin customer per the open question; pin this).
- **Idempotency / edge cases**: [API-211] **no hard-delete surface exists** — assert there is no `admin.materials.delete` procedure and no `DELETE` route for materials (quote-history integrity).

### `POST /trpc/admin.pricing.get` / `admin.pricing.put`
- **Happy path**: [API-212] `.get` → `200` returning all six fields from the singleton `id=1` row. [API-213] `.put` with new values → `200`; `.get` reflects them; still exactly one `PricingConfig` row.
- **Validation failures**: [API-214] negative `setupFee` → `422`, row unchanged. [API-215] non-numeric `costPerBend` → `422`. [API-216] a partial payload missing a required field → `422` (or documented partial-update semantics — pin one).
- **Auth failures**: [API-217] unauthenticated → `401`. [API-218] **U-CUST** → `403` and the row is unchanged.
- **Idempotency / edge cases**: [API-219] `.put` twice with the same payload → `200` both times, one row, `id` still `1`. [API-220] `Decimal(12,4)` precision is preserved: writing `3.1416` reads back `3.1416`, not `3.14`.

### `POST /trpc/admin.machine.get` / `admin.machine.put`
- **Happy path**: [API-221] `.get` → `200` with min/max quantity, `maxUploadBytes`, `allowedExtensions`, spacing, margin, `animationSpeed`. [API-222] `.put` setting `allowedExtensions:["dxf","dwg"]` → `200`; a subsequent `.dwg` upload passes the extension gate.
- **Validation failures**: [API-223] `minQuantity > maxQuantity` → `422`. [API-224] `maxUploadBytes:0` or negative → `422`. [API-225] `allowedExtensions:[]` → `422` (would block all uploads). [API-226] `sheetMarginMm` negative → `422`. [API-227] `animationSpeed:0` or negative → `422`.
- **Auth failures**: [API-228] unauthenticated → `401`. [API-229] **U-CUST** → `403`.
- **Idempotency / edge cases**: [API-230] lowering `maxQuantity` below an existing quote's quantity does not retroactively invalidate that quote.

### `POST /trpc/admin.business.get` / `admin.business.put`
- **Happy path**: [API-231] `.get` → `200` with company name, contact block, `logoObjectKey`, brand colours, `stripeSandbox`, `stripePublishableKey`, and **masked** `stripeSecretKey`/`stripeWebhookSecret` (e.g. `sk_test_••••4242`). [API-232] `.put` with a valid Stripe secret → the mocked `probeCredentials()` (balance retrieve) is called **before** the write and the save succeeds.
- **Validation failures**: [API-233] `probeCredentials()` rejecting (invalid key) → `422`/`400` with a clear message and **the previous key remains stored** (no partial save). [API-234] malformed brand colour (`"redd"`) → `422`. [API-235] malformed contact email → `422`.
- **Auth failures**: [API-236] unauthenticated → `401`. [API-237] **U-CUST** → `403`.
- **Idempotency / edge cases**: [API-238] **secrets at rest** — after a `.put`, `BusinessConfig.stripeSecretKeyEnc` in the database does **not** contain the plaintext key and decrypts back to it via `decryptSecret`. [API-239] `.get` **never** returns an unmasked secret in any field, in any environment. [API-240] `.put` submitting the *masked* value back (a round-trip from the UI) does **not** overwrite the stored secret with the mask. [API-241] decrypting with a rotated/wrong `APP_SECRET` surfaces a handled error prompting re-entry, not a `500`.

### `POST /api/admin/business/logo` (REST, multipart)
- **Happy path**: [API-242] **U-ADMIN** uploads a PNG → `200`; `BusinessConfig.logoObjectKey` is set and the object exists in MinIO.
- **Validation failures**: [API-243] a non-image file type → `422`. [API-244] a file exceeding the logo size limit → `422`, nothing stored.
- **Auth failures**: [API-245] unauthenticated → `401`. [API-246] **U-CUST** → `403`, nothing stored.
- **Idempotency / edge cases**: [API-247] re-uploading replaces `logoObjectKey` and the new logo is served (stale key not retained).

### `POST /trpc/admin.shippingMethods.list` / `.create` / `.update`
- **Happy path**: [API-248] `.list` returns active **and** inactive methods with `kind`, `rate`, `estDays`, `isActive`. [API-249] `.create` `{kind:"per_sheet", rate:8, estDays:3}` → `200`, appears in `checkout.shippingMethods` costed at `rate × sheetCount`. [API-250] `.update` deactivating the last active method makes `checkout.shippingMethods` return `409` (ties [API-148] to the admin action).
- **Validation failures**: [API-251] `kind:"carrier_pigeon"` → `422`. [API-252] negative `rate` → `422`. [API-253] `estDays:0` or negative → `422`. [API-254] `.update` unknown id → `404`.
- **Auth failures**: [API-255] unauthenticated → `401`. [API-256] **U-CUST** → `403`.
- **Idempotency / edge cases**: [API-257] deactivating a method already referenced by a placed `Order` leaves that order's `shippingCostCents` and estimated delivery intact.

### `POST /trpc/admin.orders.list`
- **Happy path**: [API-258] **U-ADMIN** → `200` returning orders **across all users** (unlike `orders.list`). [API-259] `{status:"paid"}` filters correctly. [API-260] `{page,pageSize}` paginates with a stable total.
- **Validation failures**: [API-261] `status:"bogus"` → `422`. [API-262] `page:0` → `422`.
- **Auth failures**: [API-263] unauthenticated → `401`. [API-264] **U-CUST** → `403` (a customer must not see other customers' orders through this door).
- **Idempotency / edge cases**: [API-265] zero orders → `200` empty array with `total:0`.

### `GET /api/admin/settings` (REST)
- **Happy path**: [API-266] **U-ADMIN** → `200` with one entry per service (`postgresql`, `minio`) and per integration (`MINIO_S3_MINIO_7_2_20_API_KEY`, `RESEND_API_RESEND_2_43_API_KEY`, `STRIPE_SDK_PYTHON_STRIPE_15_6_API_KEY`), each with a **masked** value and a `configured` boolean.
- **Validation failures**: n/a.
- **Auth failures**: [API-267] unauthenticated → `401`. [API-268] **U-CUST** → `403`.
- **Idempotency / edge cases**: [API-269] **no response field ever contains a full secret** — assert every returned value is masked, including when the value came from `process.env`. [API-270] a key whose env value is the literal `PLACEHOLDER_CONFIGURE_IN_SETTINGS` reports `configured:false`. [API-271] a key set neither in env nor `SystemSetting` reports `configured:false` with a null/empty masked value.

### `PATCH /api/admin/settings` (REST)
- **Happy path**: [API-272] **U-ADMIN** patches `RESEND_API_RESEND_2_43_API_KEY` → `200`; a `SystemSetting` row exists; the next `resolveConfig` call returns the new value (cache was busted).
- **Validation failures**: [API-273] an unknown settings key → `422` (allow-list enforced, arbitrary rows not writable). [API-274] a non-string/empty value → `422`.
- **Auth failures**: [API-275] unauthenticated → `401`. [API-276] **U-CUST** → `403` and no `SystemSetting` row is written.
- **Idempotency / edge cases**: [API-277] patching the same key twice upserts (one row, latest value, `updatedAt` advanced). [API-278] **precedence** — with the env var set to a real value, `resolveConfig` returns the **env** value even after a `SystemSetting` patch. [API-279] with env set to `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, `resolveConfig` falls through to the `SystemSetting` value. [API-280] with neither set, `resolveConfig` returns `null` and calling the dependent integration raises `ServiceUnconfiguredError` → `503`/`PRECONDITION_FAILED`, not `500`.

### Cross-cutting API contract
- **Auth failures (RBAC matrix)**: [API-281] a table-driven sweep asserting **every** non-public procedure and REST route returns `401` unauthenticated — the list is generated from the router registry, so a newly added procedure that forgets the guard fails this test. [API-282] the same sweep over every `admin.*` procedure and `/api/admin/**` route as **U-CUST** → `403`. [API-283] the public set is exactly `{/login, /signup (frontend), GET /health, GET /api/health/deep, POST /api/webhooks/stripe}` — any other route reachable unauthenticated fails.
- **Idempotency / edge cases**: [API-284] rate-limit keying — two different authenticated users each get their own bucket (user-id keyed), while two unauthenticated requests from one IP share a bucket. [API-285] a `429` response carries a retry hint and does not mutate state. [API-286] no `5xx` is produced by any malformed-input case in this document (all bad input maps to a `4xx`). [API-287] every error body follows one shape `{status, code, message, fieldErrors?}` so `toAppError` can render it uniformly.
- **surface.json reconciliation**: [API-288] every route listed in `.pipeline/surface.json` responds non-`404`. [API-289] `.pipeline/surface.json` contains an entry for each of the 45 endpoints in this section (fails until `backend_agent` appends them).

## UI / journey tests

### Journey: Sign up (first user becomes admin)
- **Steps**: [UI-001] Visit `/signup` unauthenticated → the form renders (`guestGuard` allows). Type email + password, submit.
- **Expected outcomes**: [UI-002] On success the app navigates to `/quotes` and the header shows the user's email plus a sign-out action. [UI-003] When the registered user is the first (role `ADMIN`), the **Admin** nav item is visible; for a `USER` it is absent. [UI-004] The access token is held **in memory only** — assert `localStorage` and `sessionStorage` contain no JWT after signup.
- **Negative path**: [UI-005] Submitting a duplicate email surfaces the server `409` inline on the email field, the form stays populated, and no navigation occurs. [UI-006] An invalid email or short password blocks submit with inline field errors and fires **no** network request. [UI-007] A `500`/network failure shows a non-blocking error block, not a blank page.

### Journey: Log in and return-url handoff
- **Steps**: [UI-008] Visit `/quotes/new/material` unauthenticated → redirected to `/login?returnUrl=%2Fquotes%2Fnew%2Fmaterial`. Log in.
- **Expected outcomes**: [UI-009] After login the app navigates to the original `returnUrl`, not the default `/quotes`. [UI-010] With no `returnUrl`, login lands on `/quotes`. [UI-011] An already-signed-in user visiting `/login` or `/signup` is bounced to `/quotes` by `guestGuard`.
- **Negative path**: [UI-012] Wrong password renders the `401` message inline without clearing the email field and without navigating. [UI-013] A `returnUrl` pointing at an external origin (`?returnUrl=https://evil.example`) is rejected and falls back to `/quotes` (open-redirect guard).

### Journey: Session refresh and single-flight interceptor
- **Steps**: [UI-014] With an expired access token, trigger three concurrent API calls from one page.
- **Expected outcomes**: [UI-015] Exactly **one** `auth.refresh` request is issued; all three original requests are replayed with the new token and resolve successfully. [UI-016] On app bootstrap with a valid refresh cookie, a silent refresh restores the session and the user is not bounced to `/login`.
- **Negative path**: [UI-017] When the refresh itself fails, auth state is cleared, all queued requests reject, and the app redirects to `/login` exactly once (not once per queued request).

### Journey: Route contract — every state is URL-addressable
- **Steps**: [UI-018] For each row of the Surface-contract route table, load the URL **directly** (cold navigation, not in-app routing) as an appropriately-privileged user.
- **Expected outcomes**: [UI-019] Each route resolves and its activated-route `data.flow` equals the declared value (`auth-login`, `auth-signup`, `quotes-list`, `quote-upload`, `quote-bends`, `quote-material`, `quote-result`, `quote-detail`, `checkout-review`, `checkout-shipping`, `checkout-payment`, `orders-list`, `order-detail`, `order-confirmation`, `account`, `admin-materials`, `admin-pricing`, `admin-machine`, `admin-business-branding`, `admin-business-contact`, `admin-business-payments`, `admin-business-shipping`, `admin-settings`, `admin-orders`) — a table-driven spec, one assertion per row. [UI-020] `:id` params and query params arrive as component inputs (`withComponentInputBinding()`). [UI-021] The root element carries `data-testid="app-ready"` on every route (Colossus acceptance probe).
- **Negative path**: [UI-022] An unknown path renders the `**` not-found page with a link home, not a blank shell or a console error. [UI-023] `authGuard` redirects unauthenticated deep-links to `/login?returnUrl=…`. [UI-024] `adminGuard` renders the 403 page for **U-CUST** hitting `/admin/pricing` and does **not** flash admin content first.

### Journey: Upload a DXF
- **Steps**: [UI-025] From `/quotes/new/upload`, drag `rect_100x50.dxf` onto the drop zone (and separately, pick it via the file input).
- **Expected outcomes**: [UI-026] An upload progress indicator advances and completes. [UI-027] The post-upload summary shows detected units (`mm`), part dimensions (`100 × 50 mm`), and cut length (`300 mm`) — the unit-ambiguity guard requires these to be prominent, not buried. [UI-028] The wizard advances to `/quotes/new/bends` and the draft store holds the drawing id. [UI-029] Uploading `mixed_skipped.dxf` renders a **skipped entities** warning listing `SPLINE` and `INSERT` with counts, so the customer sees what was ignored rather than silently under-paying.
- **Negative path**: [UI-030] Selecting `part.txt` is rejected **client-side** (mirroring `MachineConfig.allowedExtensions`) with an inline message and **no** network request. [UI-031] Selecting a file over `maxUploadBytes` is rejected client-side with the limit stated. [UI-032] A server `422` (malformed DXF) renders the parser message inline and leaves the user on `/upload` with the drop zone reusable. [UI-033] A `503` unconfigured-MinIO response renders an actionable message, not a raw stack.

### Journey: Draft persistence and wizard deep links
- **Steps**: [UI-034] Complete the upload step, then hard-reload `/quotes/new/bends`.
- **Expected outcomes**: [UI-035] The draft is restored from `sessionStorage` and the bends step renders the previously uploaded geometry. [UI-036] The 4-step progress indicator marks upload complete and bends current.
- **Negative path**: [UI-037] Loading `/quotes/new/bends` or `/quotes/new/material` with **no** draft in `sessionStorage` redirects to `/quotes/new/upload`. [UI-038] A draft whose `sessionStorage` payload is corrupt JSON is discarded and redirects to `/upload` without throwing.

### Journey: Place and edit bend lines
- **Steps**: [UI-039] On `/quotes/new/bends`, click-drag across the part to draw a bend line; click it to select; drag an endpoint to move it; set the angle via the slider and via the numeric input; toggle direction up/down; press `Delete`.
- **Expected outcomes**: [UI-040] Each drag creates one bend and one `bends.create` call; the bend list shows angle and direction. [UI-041] Slider and numeric input stay in sync and are clamped to `0–180`. [UI-042] The direction toggle persists via `bends.update` and survives a reload. [UI-043] `Delete` removes the selected bend and calls `bends.delete`. [UI-044] A keyboard-accessible fallback list lets a keyboard-only user add/edit/remove a bend without the canvas (a11y requirement).
- **Negative path**: [UI-045] Typing `200` into the angle input is rejected inline and no request is sent. [UI-046] A failed `bends.create` rolls the optimistic local state back so the canvas does not show a bend the server rejected. [UI-047] Editing bends after a quote exists shows the "edits invalidate the current quote and force recalculation" warning and marks the quote stale.

### Journey: Choose material and quantity
- **Steps**: [UI-048] On `/quotes/new/material`, open the materials dropdown, pick **M-STEEL**, enter quantity `10`.
- **Expected outcomes**: [UI-049] The dropdown lists only active materials, each showing name, thickness and sheet size. [UI-050] The live sheet-count preview updates as quantity changes and matches the nesting maths. [UI-051] Detected units and part dimensions are displayed prominently on this step (unit-ambiguity guard). [UI-052] Quantity bounds come from `MachineConfig` — the input's min/max reflect `1` and `500`.
- **Negative path**: [UI-053] Quantity `0`, `-1`, `501`, and empty each show an inline message stating the limit and disable "Get quote". [UI-054] A part larger than the sheet surfaces the `422` `PartTooLargeError` as a readable "part does not fit this sheet" message naming the material. [UI-055] Zero active materials renders an empty-state telling the customer to contact the company rather than an empty dropdown.

### Journey: Review the price breakdown
- **Steps**: [UI-056] Submit the material step and land on `/quotes/new/result`.
- **Expected outcomes**: [UI-057] Itemised line items render: setup, cutting, sheets, handling, bends — each with its own amount, summing to the displayed total. [UI-058] Sheet count and utilisation (as a percentage) are shown. [UI-059] Money renders from integer cents with exactly two decimals and no floating-point artefacts (`$176.00`, never `$175.99999`). [UI-060] "Proceed to checkout" navigates to `/checkout/:quoteId/review`.
- **Negative path**: [UI-061] When `minimumApplied` is true, a **minimum order applied** badge is shown and the total equals the configured minimum. [UI-062] A quote whose bend count is zero omits or zeroes the bends line item without breaking the sum.

### Journey: Work bed visualisation and laser animation
- **Steps**: [UI-063] Load `/quotes/new/result` (or the quote detail nesting preview); observe the canvas; click **Print Bed** to stop, then again to start.
- **Expected outcomes**: [UI-064] Three stacked canvases exist (static bed/sheet/labels, completed cuts, active). [UI-065] The animation **auto-starts** on load. [UI-066] Cut paths render blue solid and bend lines orange dashed. [UI-067] **Print Bed** toggles start/stop, and **stop resets progress to zero** (assert the internal progress signal is `0` and the completed-cuts layer is cleared after stop). [UI-068] A simulated `ResizeObserver` callback at several container sizes (very wide, very tall, tiny) recomputes the scale so the drawn extent stays **within** canvas bounds with the aspect ratio preserved — assert `scale = min(availW/contentW, availH/contentH)` and that no drawn coordinate exceeds the canvas box. [UI-069] Each finished segment is blitted **once** to the completed layer — assert per-frame draw calls on the active layer stay bounded (O(1)) as progress advances, rather than growing with completed segment count. [UI-070] Sheets 2+ are drawn statically, and rendered parts per frame are capped.
- **Negative path**: [UI-071] A drawing with zero polylines renders the empty bed without an rAF error loop. [UI-072] The rAF loop is cancelled on component destroy (no leaked animation frame after navigating away).

### Journey: Quote list and detail
- **Steps**: [UI-073] Visit `/quotes`, filter by status, change sort, page forward, then open a quote.
- **Expected outcomes**: [UI-074] Filter/sort/page state round-trips through the URL (`?status&page&sort`) — reloading the URL restores the same view. [UI-075] `/quotes/:id?panel=breakdown` opens the breakdown panel directly on load. [UI-076] The detail view shows the **stored snapshot** breakdown, the nesting preview, and re-order/checkout actions.
- **Negative path**: [UI-077] A user with no quotes sees an empty state with a "start a quote" call to action, not a spinner. [UI-078] A `403`/`404` on another user's quote id renders a not-found/denied view, never another customer's data.

### Journey: Checkout review
- **Steps**: [UI-079] From a quote, go to `/checkout/:quoteId/review`.
- **Expected outcomes**: [UI-080] Material, quantity and total render and match the quote. [UI-081] Continue navigates to `/checkout/:quoteId/shipping`.
- **Negative path**: [UI-082] Returning with `?status=cancelled` (the Stripe cancel URL) renders a "payment cancelled" banner **with the quote intact** and still purchasable. [UI-083] A non-owner id renders the denied view.

### Journey: Choose shipping
- **Steps**: [UI-084] On `/checkout/:quoteId/shipping`, review the method list and select one.
- **Expected outcomes**: [UI-085] Each method shows its resolved cost (flat, or `rate × sheetCount`) and estimated delivery in days. [UI-086] Selecting a method enables Pay and carries `shippingMethodId` into `createSession`.
- **Negative path**: [UI-087] A `409` (no active methods) renders the blocking **contact the company** message and **disables Pay** — the user cannot proceed to an unpriced order. [UI-088] A `502` from `createSession` shows a retryable error and the user stays on the page with the quote intact.

### Journey: Pay with Stripe and return
- **Steps**: [UI-089] Click Pay → redirected to the Stripe-hosted URL (mocked); return to `/checkout/:quoteId/payment?session_id=cs_test_123`.
- **Expected outcomes**: [UI-090] The return route renders a pending state and polls `checkout.status` with bounded exponential backoff. [UI-091] Once status reports paid with an `orderId`, the app redirects to `/orders/:id/confirmation`. [UI-092] Polling stops after the bounded attempt limit and does not loop forever.
- **Negative path**: [UI-093] Status stays pending past the bound → a "we're still confirming, check your orders" message with a link to `/orders`, never a hang or a silent failure. [UI-094] Landing on `/payment` with no `session_id` renders a recoverable state rather than crashing.

### Journey: Order confirmation and receipt
- **Steps**: [UI-095] Land on `/orders/:id/confirmation`; then visit `/orders` and `/orders/:id`; click the receipt download.
- **Expected outcomes**: [UI-096] Confirmation shows the order number, confirmation number, shipping address, estimated delivery and the company contact block. [UI-097] `/orders` paginates with an empty state; `/orders/:id` shows the same detail plus the receipt link. [UI-098] The receipt link downloads a non-empty file named for the order.
- **Negative path**: [UI-099] **Email failure resilience** — with Resend mocked to throw, the confirmation page still renders completely; assert the page does not depend on `emailSentAt` and shows at most a soft "receipt email may be delayed" note. [UI-100] A receipt fetch failure shows an inline error, leaving the rest of the page intact.

### Journey: Admin — materials
- **Steps**: [UI-101] As **U-ADMIN**, visit `/admin/materials`; open the create modal; edit a material via `?modal=material-edit&id=…`; deactivate one.
- **Expected outcomes**: [UI-102] The table shows active/inactive badges for every material. [UI-103] The modal is **deep-linkable**: loading `/admin/materials?modal=material-edit&id=M-STEEL` directly opens the edit modal prefilled; closing it removes the query params. [UI-104] Deactivating flips the badge and the material disappears from the customer material dropdown.
- **Negative path**: [UI-105] Server `422` validation errors map onto the offending form fields. [UI-106] `?id=` referencing an unknown material shows a not-found message inside the modal rather than an empty form that could create a duplicate. [UI-107] No delete action exists anywhere in the UI.

### Journey: Admin — pricing and machine config
- **Steps**: [UI-108] Visit `/admin/pricing` and `/admin/machine`, edit fields, attempt to navigate away dirty, then save.
- **Expected outcomes**: [UI-109] Forms are prefilled from the singleton configs; per-field validation blocks bad values before submit. [UI-110] Saving shows a success state and the values persist across a reload. [UI-111] The dirty-state guard prompts before discarding unsaved changes.
- **Negative path**: [UI-112] A server-side validation failure (`minQuantity > maxQuantity`) renders inline and the form stays dirty. [UI-113] A save failure does not falsely show success.

### Journey: Admin — business, branding, payments, shipping
- **Steps**: [UI-114] Visit `/admin/business/branding`, set company name, upload a logo, pick brand colours; `/contact` fill the contact block; `/payments` toggle sandbox and enter Stripe keys; `/shipping` create a method via `?modal=shipping-method&id`.
- **Expected outcomes**: [UI-115] `BrandingService` applies company name, logo and colours as **CSS custom properties** on the customer-facing shell — assert the computed value of the brand custom property on `:root`/host changes after save and that the header renders the new name/logo. [UI-116] Stripe secret inputs render **masked** values loaded from the server and show live validation feedback from the save-time `probeCredentials()` probe. [UI-117] The shipping modal is deep-linkable via `?modal=shipping-method&id`, supports flat vs per-sheet, and activate/deactivate.
- **Negative path**: [UI-118] A rejected Stripe probe shows the failure inline and does **not** report a successful save. [UI-119] Submitting the payments form **without touching** the masked secret field does not wipe the stored secret (pairs with [API-240]). [UI-120] A logo upload rejection (wrong type/too large) shows inline and leaves the previous logo in place.

### Journey: Admin — settings and unconfigured-credentials banner
- **Steps**: [UI-121] Visit `/admin/settings` with no integration credentials configured; fill one credential form and save.
- **Expected outcomes**: [UI-122] One row per provisioned service (`postgresql`, `minio`) and per integration (MinIO / S3, Resend API, Stripe SDK), each with a configured/unconfigured badge. [UI-123] While any are unconfigured, the prominent banner reads exactly: **"The following need credentials to activate: Stripe SDK (Python `stripe` 15.6), Resend API (`resend` 2.43), MinIO / S3 (`minio` 7.2.20)."** [UI-124] Saving a credential flips its badge to configured and removes it from the banner list; when all are configured the banner disappears entirely.
- **Negative path**: [UI-125] Values render masked and a saved secret is never echoed back in full. [UI-126] A `403` for a non-admin reaching `/admin/settings` renders the denied page.

### Journey: Admin — orders
- **Steps**: [UI-127] Visit `/admin/orders`, filter by status, page forward.
- **Expected outcomes**: [UI-128] Orders from **all** users are listed with order number, customer, total and status; `?status&page` round-trips through the URL.
- **Negative path**: [UI-129] Empty result renders an empty state. [UI-130] A **U-CUST** reaching the URL is denied by `adminGuard`.

### Journey: Account and sign-out
- **Steps**: [UI-131] Visit `/account`; view profile; sign out.
- **Expected outcomes**: [UI-132] Email and role render. [UI-133] Sign-out calls `auth.logout`, clears in-memory auth state, and redirects to `/login`; pressing Back does not restore an authenticated view.
- **Negative path**: [UI-134] A logout network failure still clears local state and redirects (the client must not stay "signed in" against a revoked session).

### Journey: Scaffold removal (Colossus acceptance)
- **Steps**: [UI-135] Build the frontend and scan the built output plus the component tree.
- **Expected outcomes**: [UI-136] None of the `.colossus-acceptance.json` reject signatures — `home-title">Users<`, `Loading...`, `Failed to load users.` — appear anywhere in the built frontend. [UI-137] `home.component.ts` and the `home-title` / `users-loading` / `users-error` / `users-list` test ids no longer exist, and `.pipeline/surface.json` no longer lists them.
- **Negative path**: [UI-138] `data-testid="app-ready"` **is** present on the root element (the acceptance probe must still find its ready marker after the scaffold is stripped).

## Data integrity tests
- [DATA-001] **User uniqueness** — a second `User` with the same email (any case) is rejected by a database constraint, not only by application code.
- [DATA-002] **Password never plaintext** — no `User.passwordHash` equals a known plaintext; every hash matches `^\$2[aby]\$10\$`.
- [DATA-003] **Refresh token hashing** — every `RefreshToken.tokenHash` is a 64-hex SHA-256 digest and never equals the token handed to the client.
- [DATA-004] **Refresh rotation** — after a refresh, exactly one live (`revokedAt IS NULL`, unexpired) token remains per rotated chain; the predecessor has `revokedAt` set.
- [DATA-005] **Cascade on user delete** — deleting a `User` removes their `RefreshToken` rows without orphaning `Drawing`/`Quote`/`Order` rows in a broken state (assert the declared FK behaviour, whichever it is).
- [DATA-006] **Drawing ↔ object parity** — every `Drawing.objectKey` matches `drawings/{userId}/{uuid}.dxf` and resolves to an existing MinIO object; a rejected upload leaves **no** `Drawing` row **and** no orphan object.
- [DATA-007] **DXF immutability** — after any bend create/update/delete, the SHA-256 of the stored MinIO object equals the SHA-256 of the originally uploaded bytes.
- [DATA-008] **Bend cascade** — deleting a `Drawing` deletes its `BendLine` rows (no orphans).
- [DATA-009] **Bend domain** — no persisted `BendLine` has `angleDeg < 0`, `angleDeg > 180`, or `direction ∉ {up, down}`, verified by a post-suite table scan.
- [DATA-010] **Material soft-delete only** — after every admin "delete"/deactivate action the `Material` row still exists with `isActive=false`; the `Material` table row count never decreases across the suite.
- [DATA-011] **Referential integrity of history** — every `Quote.materialId` resolves to an existing `Material` even after deactivation, so historical quotes always render.
- [DATA-012] **Singleton configs** — `PricingConfig`, `MachineConfig` and `BusinessConfig` each hold exactly one row with `id=1` after any number of `put` calls.
- [DATA-013] **Pricing arithmetic (unit)** — with the reference config, `cutLengthMmTotal=3048` (10 ft), `bendCountTotal=4`, `sheetCount=2`, `materialMultiplier=1.25`: `subtotal = 25 + 35 + 100 + 10 + 6 = 176.00` → `totalCents = 17600`, `minimumApplied=false`. Each of the five line items is also asserted individually.
- [DATA-014] **Multiplier scope** — the same inputs with `materialMultiplier=1.0` yield `15600`; the delta (`2000`) equals `sheetCount × perSheetCost × 0.25`, proving the multiplier touches **sheet cost only** and never the cutting line item.
- [DATA-015] **Minimum-order clamp** — with config **P-LOW**, `cutLengthMmTotal=304.8`, `bendCountTotal=0`, `sheetCount=1`, multiplier `1.0`: `subtotal = 9.00` → `totalCents = 7500` with `minimumApplied=true`, and the breakdown still itemises the true (un-clamped) line items.
- [DATA-016] **Zero bends** — `bendCountTotal=0` produces a `0`-cent bends line item, never `NaN` or a missing key.
- [DATA-017] **Integer cents** — every returned amount is an integer; rounding happens once at the end (assert `0.005`-boundary inputs round consistently and that line items sum exactly to the total, no ±1-cent drift).
- [DATA-018] **Nesting single sheet** — part `100×200`, sheet `1219×2438`, `margin=10`, `spacing=5`, `qty=50` → `cols=11`, `rows=11`, `perSheet=121`, `sheets=1`.
- [DATA-019] **Nesting multi-sheet rounding** — same geometry with `qty=300` → `sheets=3` (`ceil(300/121)`), `utilization ≈ 0.6730` (`300 × 20000 / (3 × 1219 × 2438)`), asserted to 4 decimal places.
- [DATA-020] **Exact-fit boundary** — sheet `100×100`, `margin=0`, `spacing=0`, part `50×50` → `perSheet=4`; part `50.0001×50` → `cols=1`, `perSheet=2` (the boundary is inclusive on exact fit).
- [DATA-021] **Spacing boundary** — usable `105`, `spacing=5`, part `50` → `cols=2` (`(105+5)/(50+5)=2`), confirming spacing is counted **between** parts, not after the last one.
- [DATA-022] **PartTooLargeError** — part `1300×200` on a `1219×2438` sheet with `margin=10` → `perSheet=0` raises `PartTooLargeError`, and no partial `NestResult` is returned.
- [DATA-023] **No rotation** — a `2400×100` part on a `1219×2438` sheet raises `PartTooLargeError` rather than silently rotating to fit (the engine is conservative by contract).
- [DATA-024] **Placements** — sheet 1 placements are top-left-origin, non-overlapping, count `min(qty, perSheet)`, and every `(x,y)` lies within the margin-inset usable area; per-sheet counts sum to `qty`.
- [DATA-025] **DXF cut length** — `rect_100x50.dxf` → `300 mm ±0.5%`, `entityCount=4`, bbox `100×50`.
- [DATA-026] **DXF curve flattening** — `circle_r10.dxf` → `≈62.832 mm (π×20) ±0.5%`; `bulge_semicircle.dxf` → `≈157.080 mm (π×50) ±0.5%`, proving bulge→arc conversion is not chord-approximated.
- [DATA-027] **DXF units** — `inch_square.dxf` (`$INSUNITS=1`) → `cutLengthMm≈101.6`, `detectedUnits="in"`; `unitless_square.dxf` (`$INSUNITS=0`) → `cutLengthMm≈40`, `detectedUnits="mm"`.
- [DATA-028] **DXF rejection** — `empty.dxf`, `corrupt.bin`, `spline_only.dxf` and `zero_area.dxf` each raise `DxfParseError`; `mixed_skipped.dxf` succeeds and reports `skippedEntities=[{type:"SPLINE",count:1},{type:"INSERT",count:1}]`.
- [DATA-029] **Quote totals derivation** — `Quote.cutLengthMm = drawing.cutLengthMm × quantity` and `Quote.bendCount = bendsPerPart × quantity`, asserted directly against the persisted row.
- [DATA-030] **Snapshot immutability at rest** — `Quote.pricingSnapshotJson` is non-null on every quote, contains all six pricing fields plus the material multiplier, and is bit-identical before and after an `admin.pricing.put` (the database row is re-read, not just the API response).
- [DATA-031] **Order uniqueness** — `Order.quoteId`, `Order.orderNumber`, `Order.confirmationNumber` and `Order.stripeSessionId` are each unique; a duplicate insert is rejected by the database.
- [DATA-032] **One order per quote** — after the webhook and the reconciliation poll both run for the same session, `SELECT count(*) FROM "Order" WHERE "quoteId" = ?` is exactly `1`.
- [DATA-033] **Quote status transition** — a quote is `draft` until a paid order exists, then `ordered`; no code path sets `ordered` without a corresponding `Order` row (assert no `ordered` quote lacks an order).
- [DATA-034] **Failed payment leaves no residue** — after a tampered-signature webhook and after an `unpaid` session, the `Order`, `StripeEvent` and `Quote.status` state is byte-identical to before the request.
- [DATA-035] **Webhook idempotency store** — `StripeEvent.eventId` is the primary key; replaying an event never inserts a second row and never re-runs order creation.
- [DATA-036] **Order money consistency** — `Order.totalCents = quote.totalCents + Order.shippingCostCents`, and all three are integers.
- [DATA-037] **Shipping snapshot** — an order retains its `shippingCostCents` and estimated delivery after the referenced `ShippingMethod` is deactivated or its rate changes.
- [DATA-038] **Email non-blocking** — with Resend throwing, the `Order` row still exists and `emailSentAt IS NULL`; with Resend succeeding, `emailSentAt` is set. Email failure never rolls back the order transaction.
- [DATA-039] **Secrets at rest** — `BusinessConfig.stripeSecretKeyEnc` and `stripeWebhookSecretEnc` never contain a substring of the plaintext key; both round-trip through `encryptSecret`/`decryptSecret`; a full-database dump contains no `sk_live_`/`sk_test_` literal.
- [DATA-040] **SystemSetting upsert** — `PATCH /api/admin/settings` on the same key twice leaves exactly one row with the latest value and an advanced `updatedAt`.
- [DATA-041] **Decimal precision** — `Decimal(12,4)` config fields and `costMultiplier` round-trip `3.1416` without truncation, and pricing reads them as exact decimals (not lossy floats) before the final cent rounding.
- [DATA-042] **Migration cleanliness** — `npx prisma migrate deploy` followed by `npx prisma migrate dev --create-only` against a fresh database produces **no** pending diff (the schema and the committed migrations agree).
- [DATA-043] **Seed idempotency** — running `seed.js` twice leaves exactly one row per singleton config, preserves `COLOSSUS_ACCOUNTS_JSON` accounts, and creates **zero** demo materials, shipping methods, drawings, quotes or orders (the build gate rejects unguarded fixtures).

## Out of scope
- **`GET /trpc/users.findAll` and `GET /trpc/users.findById`** — listed in `.pipeline/surface.json` but they are greenfield-scaffold stubs that `ui_agent` and `backend_agent` are tasked with **deleting**. Rather than test them, [UI-137] and [API-289] assert they (and their test ids) are gone from the codebase and from `surface.json`. If they are still present at gate time, that is a failure of those cases, not a coverage gap here.
- **`MANAGER` role permissions** — the stack contract mints a `MANAGER` login but neither the spec nor `tasks.md` defines its rights (flagged as an open question). [API-210] pins the *currently assumed* behaviour (treated as a non-admin customer, `403` on admin surfaces); if the answer changes, that single case changes with it. No broader `MANAGER` matrix is specified.
- **Real Stripe network calls** — all Stripe interaction is tested against a mocked SDK plus signed fixture events. The spec's manual card tests (`4242…` success, `4000 0000 0000 0002` decline) stay **manual**; no automated test hits Stripe's servers.
- **Real Resend delivery** — `sendOrderConfirmation` is mocked in every automated test. Inbox delivery, deliverability and email HTML rendering across clients are unverified; only the branding-injection payload and the failure-tolerance path are asserted.
- **Actual 60 FPS measurement** — the spec's frame-rate target is a performance goal, not an assertable unit. [UI-069] tests the *mechanism* that makes it achievable (O(1) per-frame work via layer blitting) rather than measuring frames; real FPS remains a manual check.
- **Visual/pixel correctness of canvas rendering** — bend and cut *geometry* correctness is asserted numerically, but no screenshot/pixel-diff baseline is specified for the work bed or bend editor.
- **DXF variety beyond the fixture set** — `SPLINE`, `INSERT`/blocks, 3D and other unsupported entities are tested only via the skipped-entities reporting path. Cut-length accuracy for files that lean on unsupported entities is a known, accepted risk (surfaced to the user, not tested away).
- **Receipt format** — the spec never chose PDF vs HTML (open question); [API-193] asserts a non-empty stream with the right filename and content, deliberately not a format-specific structure.
- **Password reset / email verification / password change** — not described in the spec; `/account` password change is conditional on the auth surface supporting it and is therefore untested.
- **Deploy topology** — the backend port mismatch (`3001` vs `3000`), the nginx `/api` prefix split, PgBouncer connection parameters and `APP_SECRET` provisioning are all flagged open questions in `tasks.md`. They are infrastructure decisions verified at deploy time, not by this suite — except [API-241], which covers the *application's* behaviour when `APP_SECRET` is wrong.
- **Redis-backed rate limiting** — the spec's Redis sliding window is replaced by the in-memory `@nestjs/throttler` because no Redis is provisioned. Limits are tested per-instance ([API-017], [API-023], [API-056], [API-122], [API-160], [API-284]); multi-replica limit sharing is explicitly not tested and does not hold.
- **Load, concurrency and soak testing** — beyond the two targeted race cases ([API-176] concurrent webhook delivery, [DATA-032] webhook-vs-poll double-insert), no throughput or sustained-load characteristics are specified.
