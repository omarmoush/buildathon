# Person 2 handoff

Only Person 2's modules are changed. This repository uses `artifacts/wasta/src`
instead of `client/src`, and `artifacts/api-server/src` instead of `server`.
Do not merge this as a standalone finished deployment: Person 1 must wire the
shared entry points and implement the agreed public order API.

## Person 1: shared frontend entry

In `artifacts/wasta/src/App.tsx`, import:

```tsx
import { QuizPage } from "./quiz";
import { BuyerPage as PublicBuyerPage } from "./buyer";
```

Inside the existing `Switch`, register `/quiz` and `/w/reda` with `QuizPage`,
and replace the `/b/:token` component with `PublicBuyerPage`. Keep owner routes
and the owner's existing implementation unchanged.

## Person 1: server entry

The new Express routers contain `/catalog` and `/meshy` prefixes and belong
under the existing `/api` mount:

```ts
import catalogRouter from "./catalog";
import meshyRouter from "./meshy";
router.use(catalogRouter);
router.use(meshyRouter);
```

No package or database changes are needed for these two routers. Local,
deterministic GLBs and thumbnails are served from
`/api/catalog/fallback/:id.glb` and `/api/catalog/thumbnail/:id.svg`. This keeps
fallback assets within Person 2's ownership instead of editing shared public
folders. They are simple demo geometry, not production furniture drawings.

## Contract gaps in the current repository

The current `POST /api/orders` is owner-authenticated and takes
`title/description/dimensions`, not the public `{buyerName,buyerPhone,buyerCountry,spec}`.
It must return `{orderId,token}` for this quiz. Persist the whole spec including
`pieceSource`, model URLs, dimensions and material choices. Optional additions:
`referencePhotos`, `bedroomPieces`, `generationTaskId`.

The current buyer API is `/api/buyer/:token` and uses generated legacy types.
Implement the specified `/api/b/:token` endpoints rather than silently mixing
contracts. The new page expects the `BuyerOrder` boundary in `types.ts`,
including `spec`, `designApproved`, `updates`, quote EGP amounts and locked `fxRate`.

Required mutations:
- `POST /api/b/:token/approve-design`
- `POST /api/b/:token/request-changes` with `{comment}`
- `POST /api/b/:token/pay` with `{type:"deposit"}` returning `{checkoutUrl}`
- `POST /api/b/:token/confirm-delivery`, optionally returning `{checkoutUrl}` for balance payment
- `POST /api/uploads` public multipart field `file` (the current upload is owner-only JSON).

Payments currently simulate immediate settlement. Real Paymob integration,
webhook verification, durable order/spec persistence and server-enforced
status transitions belong to Person 1. This UI never marks a live payment
successful merely because checkout returned; it re-fetches server state.
Checkout redirects accept HTTPS Paymob domains only.

## Furniture3D reuse and operation

There are no Furniture3D sources in this GitHub revision. `Furniture3D.tsx`,
`useFurnitureGeneration.ts` and the Meshy router adapt the supplied Furniture3D
reference's viewer, task polling, real-scale AR attributes and server-only API
client. Quiz and buyer use the same viewer; no duplicate 3D implementation.
The buildathon requires **preview only**, so refine is intentionally omitted.

The pinned model-viewer runtime loads from unpkg. Production CSP must permit
that runtime and the model fetches. Android/iOS AR needs a real supported phone
and HTTPS; browser emulation does not establish real-world placement.
Customized previews scale X/Y/Z as width/height/depth. They omit the catalog's
USDZ so iOS generates an asset from the transformed model rather than opening
an unscaled USDZ. Wood/finish choices are saved; preview materials are illustrative.

Meshy stays server-only. No key or `MESHY_DEMO=true` enables a visibly labelled
prepared-model demo. With a key, a Generate click spends credits. Never test a
paid request without approval. Rate limiting is in-memory, three starts per
minute per IP, with 200 tasks and 24-hour expiry. Task handles are process-local;
server restarts invalidate generated model links. Persist tasks/assets and add
durable abuse controls before public production use.

Asset proxy accepts only Meshy HTTPS assets, disallows redirects and refreshes
signed upstream URLs on read. Meshy may delete source assets later; durable
storage belongs in the shared backend. Local catalog models remain available.

## Explicit demo

- `/quiz?demo=1`: uses a visibly labelled local catalog and saves a mock order
  in sessionStorage. No live order submission or payment.
- `/b/demo-person2?demo=1`: mock buyer page with a status selector for the demo.
  Mock orders are tab-local; do not share demo magic links as real orders.
- Normal URLs **never** silently turn a failed live action into a mock success.
- Generation continues while moving through later quiz steps; submit waits for
  “Keep this piece” or the prepared fallback. A slow/failure fallback is offered
  at 90 seconds and is also available immediately.

## Verification status

Testing was stopped at the user's request. Before that request, frontend
typechecking, the existing frontend production build, isolated owned-backend
typechecking, local GLB validation and demo-route checks passed. Browser flow
checks were not completed. The shared entry points are deliberately unchanged,
so the existing production build does not yet bundle these new screens.
No real Meshy credits, real Paymob transactions, database migrations, deployment,
or physical-phone AR checks were performed. No shared dependencies or lockfile
were changed. The shared Express lockfile currently includes `proxy-addr@2.0.7`,
which was blocked by the package firewall; isolated route checks used Express
5.3.0 instead. Person 1 owns any shared dependency update.
