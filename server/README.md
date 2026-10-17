# Person 1 backend handoff

- Active API: `server/index.ts`, served by the existing API artifact.
- Contract: `shared/contract.ts`. Owner/buyer/quiz/Meshy/catalog source is not modified.
- SQLite: `server/data/wasta.sqlite`, WAL mode, foreign keys, transactions, idempotent seeds. The old PostgreSQL database is retained but no longer used by this server. Existing PostgreSQL orders were **not migrated**.
- Owner: phone `01001234567`, PIN `1234`; login/session/logout remain available under `/api/auth`.
- New quiz orders are public. Owner list/detail/design/quote/progress/ready routes require the owner cookie. Buyer routes use the unguessable order token.
- Status starts at `requested`. `depositPercent` is a fraction (`0.5` = 50%). All provider amounts must be EGP. Demo FX: SAR 13, AED 13.5, USD 49.
- Multipart uploads use field `file` and return `/uploads/<uuid>.<extension>`. PNG/JPEG/GIF/WebP, maximum 8 MB. Local files and SQLite are not deployment-durable storage.
- Legacy API aliases and read-only field aliases remain for the previous demo UI, but the new frontend should use the shared contract. The previous UI's percentage display and `draft` status need to be adapted by its owner.
- `client/src/App.tsx` is the requested contributor route shell, **not** a replacement for the existing web artifact entrypoint.
- Person 2 routes are auto-mounted at restart when `server/routes/catalog.ts` and `meshy.ts` exist. Export an Express router as default, `catalogRouter`/`meshyRouter`, or `router`. Define full resource routes such as `/catalog` within the router; `/api` is mounted here. Until then those endpoints return 501.

## Payment limitation

Paymob was requested but is not available through the supported payment setup used here. No real gateway is integrated and no provider credentials are read. `createCheckout(order, type)` in `routes/paymob.ts` deliberately throws `503 PAYMENTS_UNAVAILABLE`; it never returns a fake checkout URL.

The internal settlement function in `routes/payments.ts` is transaction-safe and idempotent, and is tested with synthetic records. A future supported adapter must validate provider authenticity, reference, merchant, EGP amount, currency, and payment type before invoking it. There is no public settlement endpoint, webhook bypass, or redirect-based payment success. “Held” and “released” are bookkeeping labels, not provider escrow or transfer operations.

## Verification

`pnpm --filter @workspace/wasta-server run typecheck`

`pnpm --filter @workspace/wasta-server run test`
