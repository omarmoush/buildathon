# Wasta contributor integration

## Active application

- Frontend: `artifacts/wasta/src/App.tsx`. The contributor shell in
  `client/src/App.tsx` re-exports this same application instead of maintaining
  a separate placeholder route tree.
- Backend: `server/index.ts`, SQLite via Person 1's server. The old
  `artifacts/api-server/src/routes/wasta.ts` PostgreSQL implementation is not
  the active backend and has not been rewritten.
- Shared wire types: `shared/contract.ts`. Quiz specs use `OrderSpec` directly.
- `/quiz` and `/w/reda` render `QuizPage`; `/b/:token` renders `BuyerPage`.
  Existing `/owner`, `/owner/orders/:id`, `/orders/:id`, and owner tools remain.

## Connected flow

1. Buyer selects bedroom pieces, styles, catalog/customized/generated piece,
   dimensions/materials, delivery and contact details. The quiz submits the
   agreed public `POST /api/orders`, which returns `{orderId, token}`.
2. Person 1 persists the spec in the existing SQLite `spec_json` field. Optional
   bedroom pieces, uploaded reference photos and generation task ID are now
   accepted and preserved. Reference photos also enter the owner's image list.
3. New requests appear in the existing owner dashboard. It refreshes every
   15 seconds; owner detail refreshes every 10 seconds.
4. Owner can send the selected 3D design directly for review with
   `POST /api/orders/:id/start-design`, or use the existing image-design form.
5. Buyer sees the same model/spec and the workshop's latest design images,
   then approves or requests changes through Person 1's public buyer routes.
6. Owner's existing quote builder is unlocked after approval. Existing FX tools
   are retained. `SA` and `AE` country codes now select the correct reference
   currencies and WhatsApp prefixes. Quotes retain the locked rate.
7. Buyer sees quote amounts in EGP and reference currency, expiry, progress,
   images and delivery actions from the same order and ledger.

## Catalog, Meshy and AR

Person 1's backend auto-loads `server/routes/catalog.ts` and `meshy.ts`.
These thin contributor-owned entry points re-export Person 2's existing route
implementations in `artifacts/api-server/src/routes/`, so there is one catalog,
Meshy client and local asset generator.

The five locally authored demo GLBs and thumbnails are served under
`/api/catalog/fallback/` and `/api/catalog/thumbnail/`. They do not require
Meshy credits or third-party model downloads.

Quiz, buyer and owner now reuse one `Furniture3D` component. Customized models
use width/height/depth scale consistently in all three views. The component
omits an unscaled catalog USDZ when scaling, allowing model-viewer to generate
the transformed iOS asset. Wood/finish choices are specifications, not a
photorealistic material preview.

Live generation is preview-only, asynchronous and server-side. The quiz remains
navigable during generation; submission requires acceptance or a fallback.
The prompt and task ID survive a tab reload in sessionStorage. Generation
failure or a wait of 90 seconds exposes the prepared model; it is also
available immediately. No key or `MESHY_DEMO=true` produces a labelled prepared
demo, never an unlabelled claim that the model came from the prompt.

Generated task mapping remains process-local with 24-hour expiry. Server
restarts invalidate task-backed asset URLs; Meshy may delete source models.
Durable task/asset storage and distributed abuse protection remain production
requirements. The runtime loads pinned model-viewer 4.1.0 from unpkg; real
AR placement requires HTTPS and a supported physical phone.

## Payments: explicit remaining limitation

The active SQLite backend does **not** simulate a successful real payment.
No supported checkout provider is connected. Person 1's Paymob boundary fails
with `503 PAYMENTS_UNAVAILABLE`, with no fake URL, public settlement bypass,
or payment-state change.

The server exposes `paymentMode: "unavailable"` as additive response metadata.
The buyer screen labels this limitation and disables deposit/delivery-payment
actions. Its `?demo=1` mode remains an explicitly local UI simulation and never
changes real server orders. Held/released badges are ledger states, not a
promise of provider escrow.

Real checkout, verified provider callbacks, settlement and production payment
configuration are not implemented by this integration. Connecting the screens
does not make those financial operations available.

## Other deployment limits

SQLite and uploads are local to the current service. They need durable storage
before production replacements or scaling. The previous PostgreSQL database
and historical orders were not migrated or deleted.

## Verification

No tests, build, runtime smoke checks, paid generations, payment transactions,
database migrations or deployments were run for this integration, per the
user's instruction not to test. This is a source-level integration, not a
claim of verified end-to-end runtime behavior.
