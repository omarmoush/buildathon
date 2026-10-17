# Wasta

Wasta helps small Egyptian workshops manage custom orders, share production progress, and collect simulated milestone payments from buyers through private links.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/wasta run dev` — run the Wasta web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — signs owner session cookies

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Web: React + Vite in `artifacts/wasta`
- Build: esbuild (API bundle)

## Where things live

- `artifacts/wasta/src/App.tsx` — owner and buyer experience, routes, and Arabic/English interface
- `artifacts/api-server/src/routes/wasta.ts` — Wasta API, validation, auth, and order actions
- `artifacts/api-server/src/lib/wasta.ts` — status transitions, seed data, quote calculations, and dashboard totals
- `artifacts/api-server/src/lib/payments.ts` — simulated payment adapter
- `artifacts/api-server/uploads/` — demo images and locally uploaded image files
- `lib/db/src/schema/wasta.ts` — PostgreSQL tables
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Owner sign-in uses the requested phone + 4-digit PIN flow; buyers use unguessable magic links and do not create accounts.
- Payments are simulated behind a provider interface; deposits remain held until delivery confirmation and balance payment.
- Quotes store their exchange rate at send time. The displayed demo rates are editable before the quote is locked.
- User-uploaded images are saved to the API service's local uploads folder for this MVP.

## Product

- Arabic-first, RTL-capable owner dashboard and buyer order page with an English toggle.
- Order creation, design approval and change requests, quote creation, progress updates, WhatsApp links, notifications, and simulated checkout.
- Seeded demo owner: Reda, phone `01001234567`, PIN `1234`.

## User preferences

- Keep real payments, WhatsApp API messaging, and public buyer accounts out of this MVP.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run codegen before building against the generated types.
- After changing `lib/db/src/schema/`, push the development database schema with the `@workspace/db` push command.
- Local image files are suitable for the MVP demo but need durable object storage if uploads must persist across published service replacements.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
