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

## Secrets

Set these as Replit Secrets, or copy `.env.example` to a repo-root `.env` for local runs (`dev` and `start` load it with `--env-file-if-exists`). `.env` is git-ignored; never commit keys.

| Variable | Used for |
| --- | --- |
| `SESSION_SECRET` | Owner login sessions (required) |
| `MESHY_API_KEY` | Real Meshy text-to-3D previews. Without it, or with `MESHY_DEMO=true`, generation returns the demo catalog model |
| `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY` | Paymob Intention API and Unified Checkout. `egy_sk_test_…` keys run in test mode |
| `PAYMOB_INTEGRATION_ID` | The card integration to charge. It must belong to the same Paymob account and mode as the secret key |
| `PAYMOB_HMAC_SECRET` | Verifies Paymob webhooks and return redirects |
| `PUBLIC_BASE_URL` | Optional. Public origin Paymob calls back to; defaults to the request's origin |

## Payments (Paymob)

Payments are enabled only when the four `PAYMOB_*` checkout variables are set; otherwise `createCheckout` throws `503 PAYMENTS_UNAVAILABLE` and buyers see payments as unavailable. `/api/healthz` reports `paymob-test`, `paymob-live` or `unavailable`.

1. `POST /api/b/:token/pay` creates a Paymob intention for the exact EGP deposit or balance and returns the Unified Checkout URL. The pending payment stores Paymob's order id as `paymob_ref`. A provider error returns `502 PAYMENT_PROVIDER_ERROR` and records nothing.
2. Paymob posts the result to `POST /api/paymob/webhook?hmac=…` (set the dashboard's transaction processed callback to `https://<host>/api/paymob/webhook`). It also redirects the buyer to `GET /api/b/:token/payment-return?…&hmac=…`, which works on localhost where webhooks cannot arrive.
3. Both are verified with HMAC-SHA512 over Paymob's 20 transaction fields. Only a verified, successful, non-pending, non-voided EGP transaction on the configured integration settles through `settleVerifiedPayment`, which re-checks the reference and amount against the locked quote. Forged, tampered, declined and replayed callbacks change nothing.

Orders do not collect an email, so checkout sends the placeholder `buyer@wasta.invalid` that Paymob requires. “Held” and “released” are bookkeeping labels, not provider escrow or transfer operations. A buyer who abandons checkout cannot start a second one for the same payment yet ("A checkout is already pending").

## Verification

`pnpm --filter @workspace/wasta-server run typecheck`

`pnpm --filter @workspace/wasta-server run test`
