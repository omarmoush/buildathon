# Wasta

Wasta helps Egyptian workshops manage custom furniture orders and share progress with buyers through private links. The active backend uses SQLite; real payment checkout is not connected.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/wasta run dev` — run the Wasta web app
- `pnpm --filter @workspace/wasta-server run test` — isolated backend integration tests
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- The legacy PostgreSQL schema and database are retained, but the active server does not use them. Existing PostgreSQL orders were not migrated.
- Required env: `SESSION_SECRET` — signs owner session cookies
- Cloudflare: `npx wrangler@4 deploy` (wrangler.jsonc) builds the web app and deploys the Worker `buildathon` — API on D1 (`buildathon-db`), uploads on R2 (`buildathon-uploads`), secrets set with `wrangler secret put`. Local Worker: `npx wrangler@4 dev` (put `SESSION_SECRET` in `.dev.vars`).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Active DB: SQLite via better-sqlite3, in `server/data/wasta.sqlite`
- Validation: Zod
- Legacy frontend API codegen: Orval (from OpenAPI spec)
- Web: React + Vite in `artifacts/wasta`
- Server runtime: tsx (development and production)

## Where things live

- `artifacts/wasta/src/App.tsx` — owner and buyer experience, routes, and Arabic/English interface
- `artifacts/wasta/src/quiz/`, `buyer/` — public quiz and buyer magic-link screens, mounted by the active frontend
- `artifacts/wasta/src/quiz/INTEGRATION.md` — contributor wiring, shared flow and remaining payment/storage limitations
- `server/index.ts` — active Express entrypoint, run by the API artifact
- `server/db.ts`, `server/seed.ts` — SQLite schema, transitions, serialization, and seed data
- `server/routes/` — active order, quote, upload, FX, and payment-boundary routes
- `shared/contract.ts` — supplied three-contributor API/type contract
- `server/README.md` — backend handoff and current payment limitation
- `client/src/App.tsx` — re-exports the active web artifact App so there is only one route tree
- `server/routes/catalog.ts`, `meshy.ts` — active-server entries reusing Person 2's existing catalog/Meshy implementation
- `uploads/` — locally uploaded images; `artifacts/api-server/uploads/` supplies bundled demo images
- `lib/api-spec/openapi.yaml` — previous frontend contract, not renamed during contributor handoff

## Architecture decisions

- Owner sign-in uses the requested phone + 4-digit PIN flow; buyers use unguessable magic links and do not create accounts.
- Paymob was requested but is unavailable through the supported payment setup. Checkout/webhooks fail explicitly with 503; the internal verified-settlement bookkeeping is tested but not publicly callable.
- Quotes store their exchange rate at send time. The displayed demo rates are editable before the quote is locked.
- User-uploaded images and SQLite are local to this MVP service; the previous PostgreSQL database was left untouched to avoid deleting prior data.
- The shared contract uses `requested`, not `draft`, and `depositPercent` is a fraction (0.5 = 50%). Read-only legacy field aliases remain while frontend contributors adapt.
- Optional quiz bedroom pieces, reference photo URLs and Meshy task IDs are persisted in the existing spec JSON. Owner and buyer read the same order; no second order store is introduced.
- The active order response includes `paymentMode: "unavailable"`; the buyer UI disables checkout while that boundary remains unconfigured. Local `?demo=1` screens do not modify server payment states.
- The user explicitly chose “Build the rest; leave Paymob payments pending.” Do not substitute a provider, simulate real deposits, or expose manual mark-paid controls.
- Planning estimates use illustrative rates, not approved supplier prices. Save the server-calculated snapshot with the order; allow the workshop to replace it before the final quote. A final approved quote, not the planning estimate, determines any future payment.
- The estimated deposit defaults to 50%; the workshop can set the final deposit percentage before locking the quote. A deposit review is separate from request/design approval and must be accepted before starting production.
- The public home page is the buyer entry point. Workshop sign-in/dashboard stays at `/owner`; preserve both new and legacy order detail links.

## Product

- Arabic-first, RTL-capable owner dashboard and buyer order page with an English toggle.
- Backend supports public quiz orders, design review/changes, locked quotes, photo uploads, progress, readiness, notifications, and owner totals.
- Seeded demo owner: Reda, phone `01001234567`, PIN `1234`.

## User preferences

- The user is coordinating three contributors in one shared project. Never rename shared types/routes or rewrite another contributor's area.
- The user instructed: do not run tests.
- Person 1 owns `server/index.ts`, `db.ts`, `seed.ts`, order/quote/payment/Paymob/upload/FX route files, `shared/contract.ts`, and the initial `client/src/App.tsx` shell.
- Person 2 owns `server/routes/meshy.ts`, `catalog.ts`, and `client/src/buyer/**`, `client/src/quiz/**`. Person 3 owns `client/src/owner/**`.
- Dependency/startup configuration changes were explicitly authorized to run the SQLite backend. The user subsequently authorized a cohesive public landing, quiz, estimates, buyer order, and admin review experience.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run codegen before building against the generated types.
- Do not claim payment success from a return URL or bypass webhook verification for live payments. “Held/released” records are not provider escrow.
- SQLite and image files need durable storage if they must survive published service replacements.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
