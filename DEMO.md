# Persona 3 — owner app and two-minute demo

## Scope and branch

Branch: `persona-3-owner`. This repository already implements the owner and buyer
in `artifacts/wasta/src/App.tsx`, rather than the brief's `client/src/owner`.
New owner-only components and tests live in `artifacts/wasta/src/owner/`.
Edits to App.tsx are restricted to owner screens, imports, and owner route aliases;
the buyer implementation and server/shared API files are unchanged.

## Before presenting

- Start the existing API and Wasta web app using the commands in `replit.md`.
  The API needs its existing development database and session secret; do not put
  their values in the client or this document.
- Open `/owner`. Use the seeded Reda phone/PIN shown on the login form.
  Existing server authentication is deliberately preserved, not bypassed.
- Confirm the seeded orders exist: Bedroom set (`demo-bedroom`, in production),
  Dining table + 6 chairs (`demo-dining`, quoted), Wardrobe (`demo-wardrobe`, ready).
  Seed data is created only for an empty database. Used demo orders are not
  reset by this branch.
- Check the dining quote has not expired and remains unpaid. Its seeded quote is
  materials 24,000 EGP + labor 18,000 EGP, 20% cost markup, total 50,400 EGP.
  If it has already been paid/expired, prepare another approved, unpaid order
  with these numbers through the normal UI before presenting.
- Leave the dashboard rate at **48.5 EGP/USD**, target **15%**. These are demo
  assumptions, not a live exchange-rate feed.
- Have a supported JPEG/PNG/WebP/GIF photo under 8 MB available for a progress post.
- Open the wardrobe's buyer link in a separate tab. Do not share live magic links
  publicly; they grant access to that buyer's order.

## Exact two-minute click path

| Time | Actor | Clicks / narration |
| --- | --- | --- |
| 0:00–0:15 | Reda | Open `/owner`, sign in if needed. Show open orders, deposits, balances due, and **Money released to workshop**. Say: “The owner can follow work and payments without chasing chats.” |
| 0:15–0:40 | Reda | Open **Bedroom set**. Show its specification, design images, payment summary, and timeline. Click **Post update**, select **Finishing**, attach the photo, type a short note, and submit. Use **Mark ready for delivery** only when the work is actually ready. |
| 0:40–1:05 | Buyer, then Reda | Switch to the already-open **Wardrobe** buyer page. Click **Confirm delivery received**, choose card/wallet in the simulated checkout, then **Pay**. Return to the owner dashboard and reload it. The wardrobe is closed and released money increases. Say explicitly: “This release is a simulated ledger entry, not a bank transfer or regulated escrow.” |
| 1:05–1:25 | Reda | Open **Dining table + 6 chairs**. Show the locked SAR reference price and EGP equivalent, then the Arabic WhatsApp message/link. Explain that FX display does not change the amount charged in EGP. Return to the dashboard. |
| 1:25–1:50 | Reda | In **Exchange-rate stress test**, move the USD slider to **+20%** (58.2 EGP/USD). The unpaid dining quote gains a red **Below target margin · 7.1%** warning. Say: “Imported materials cost more; labor and the locked selling price stay fixed.” |
| 1:50–2:00 | Reda | Click **Reset**: the warning disappears at the 48.5 baseline. End: “We show the owner which unpaid quotes have become risky, without silently changing the buyer's agreement.” |

If a checkpoint slips, skip photo upload first. Do not imply an unpaid quote is
already paid or edit the database by hand during the presentation.

## Quote-builder rehearsal (before the timed demo)

On a new order, upload a design and have the buyer approve it through the magic
link. Open **Prepare quote** and enter materials 24,000, labor 18,000, cost markup
20%, SAR, rate 13.1, and a future expiry. The preview is 50,400 EGP / 3,847.33 SAR,
deposit 47.62% / 1,832.10 SAR (the current server's rounding).
The **What if the dollar changes?** slider runs from −10% to +20%. At +20%:
materials 28,800 EGP, profit 3,600 EGP, actual profit margin 7.1%.
Submitting still saves the original costs and agreed FX, not the simulated values.

The API's field `marginPercent` is actually a markup on costs. The input is now
labelled **Cost markup**; warning margin is profit divided by selling price.
For example, 20% markup gives 16.67% margin at the baseline, not 20%.

## Integration boundaries / honest limits

- Current server status `draft` is treated as a new request and pinned first.
  No shared statuses or routes are renamed. Sharing a design through the existing
  upload flow moves the request into design review; there is no separate
  `start-design` endpoint in this repository.
- `/owner`, `/owner/orders/new`, and `/owner/orders/:id` are aliases. Existing
  `/`, `/orders/new`, `/orders/:id`, and buyer `/b/:token` links keep working.
- Dashboard stress controls are local to that dashboard session and reset on
  reload/navigation. They never write rates or prices to the API. Warnings apply
  only to unpaid, unexpired `quoted` orders, not paid/ready/closed orders.
- The FX model assumes all material cost tracks USD against a fixed demo baseline
  of 48.5. It is an estimate, not inventory exposure accounting or a historical
  per-quote USD rate.
- Deposit share is calculated by the existing server and is not independently
  editable. Currency presets use its existing demo table; this server does not
  implement the newer brief's `/api/fx` endpoint.
- Current API responses have description/dimensions/images, but no structured
  quiz `spec`. The owner can display product/style/dimensions/wood/finish/budget/
  deadline/delivery/notes and GLB/USDZ when a teammate's API supplies `spec`.
  No model or missing specification is fabricated for current seeded orders.
- The optional 3D viewer lazy-loads a pinned Google model-viewer module from
  unpkg; GLB/USDZ files must be reachable and permit the appropriate CORS access.
  Direct model links remain available if the renderer fails. AR needs a supported
  device and usually HTTPS. AR and real model rendering require device testing.
- Payments in this repository are **simulated**. This branch does not add Paymob,
  regulated escrow, real WhatsApp messaging, or live currency collection.
- Selecting the `ready` progress stage posts an update only; use the separate
  **Mark ready for delivery** button to advance the order.

## Verification commands

```sh
pnpm --filter @workspace/wasta... install --frozen-lockfile
pnpm --filter @workspace/api-client-react exec tsc --build
pnpm --filter @workspace/wasta run typecheck
PORT=4173 BASE_PATH=/ pnpm --filter @workspace/wasta run build
node --experimental-strip-types --test artifacts/wasta/src/owner/quote-math.test.ts
```

Browser smoke checks use mocked API responses; they do not prove the database,
live payment flow, real model rendering, or AR works. They cover the 390px
Arabic/English layout, request pinning, released totals, rate warnings/reset,
quote preview and safe submission, uploads, failures/retries, owner aliases,
and failed login without uncaught browser errors.

In one terminal, serve the build:

```sh
PORT=4173 BASE_PATH=/ pnpm --filter @workspace/wasta run serve
```

In another terminal, install Chromium and run the smoke checks without changing
application dependencies:

```sh
pnpm dlx playwright install chromium
pnpm --package=playwright dlx -c 'PLAYWRIGHT_MODULE="$(dirname "$(command -v playwright)")/../playwright/index.mjs" node artifacts/wasta/src/owner/owner.browser.test.mjs'
```

On a Nix host, use an installed system Chromium instead of the downloaded binary
by prefixing the test command with `CHROMIUM_PATH="$(command -v chromium)"`.

If the full workspace install is blocked by the package firewall on the existing
backend dependency `proxy-addr@2.0.7`, use the frontend-filtered install above.
Do not bypass the firewall. Backend dependency remediation is outside Persona 3.
