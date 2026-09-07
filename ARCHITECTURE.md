# Architecture

## Stack

This project was scaffolded with the **enterprise** platform stack:
Angular 19 (frontend) + NestJS + tRPC (backend) + Prisma + PostgreSQL.

> Note: the technical plan for this project (CNC Quick Quote) described a
> FastAPI/Python backend and Angular 22. The platform stack for this app is
> fixed at creation time to Angular 19 + NestJS + tRPC + Prisma + PostgreSQL
> (the `enterprise` template) regardless of what a plan names — build agents
> should implement the plan's **features** (DXF upload/parsing, nesting,
> pricing, Stripe checkout, admin config, etc.) on top of this stack, using
> Node-based equivalents for parsing/nesting logic instead of `ezdxf`.

## Requested vs. scaffolded

- Requested stack: `enterprise`
- Newly scaffolded: yes (project directory was empty aside from `README.md`,
  `.git`, and `.github`)

## Layout

- `frontend/` — Angular 19 SPA (standalone components, `app-root` /
  `app-home` starter). Built with `ng build`; output at
  `dist/frontend/browser`.
- `backend/` — NestJS API exposing a tRPC router (`users` router, `health`
  controller) and Prisma ORM against PostgreSQL.
- `backend/prisma/` — Prisma schema and migrations.
- `.pipeline/surface.json` — machine-readable manifest of routes,
  components, and `data-testid` values. Kept in sync as features are added;
  test generators read this file as the contract for what UI/API surface
  exists.
- `docker-compose.yml` — local Postgres + app services.
- `colossus.yaml` — build manifest read by deploy agents (Angular +
  NestJS layout, output dirs, ports).
- `.colossus-acceptance.json` — acceptance contract for the post-deploy
  render gate (readiness test id + reject signatures for the default
  template stub).

## Next steps

1. Copy `.env` files as needed (`backend/.env`) and fill in the PostgreSQL
   connection string plus any other required secrets (Stripe, Resend,
   MinIO/S3) as the corresponding features are implemented.
2. Run `npm install` in both `frontend/` and `backend/`.
3. Run `npx prisma migrate dev` in `backend/` once the schema is extended
   for this app's domain models (drawings, materials, quotes, orders, etc.).
4. Run `docker-compose up` to bring up PostgreSQL locally.
5. Implement the CNC Quick Quote feature set (DXF upload & parsing, grid
   nesting, pricing engine, Stripe Checkout, admin configuration, order
   management) as NestJS modules/tRPC routers and Angular features on top
   of this scaffold, updating `.pipeline/surface.json` as routes/components/
   test ids are added.

## Template source

`template-enterprise` from the scaffold-templates directory, copied
directly into the project root (`frontend/` + `backend/` already present
inside the template).
