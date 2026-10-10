# SupportOps UI

The frontend implements the approved designs from the **AgnId** Paper workspace: the Screens page and the separate 00 · Design System page (file `01KT7SP5V66SGQ31X7SJFEHRGT`).

## Shared foundations

`app/design-tokens.css` owns the palette, typography sizes, spacing, and radii. `app/globals.css` applies those tokens to forms, tables, panels, navigation, focus states, and responsive layouts. Reusable components live in `components/ui`; the application shell lives in `components/shell.tsx`. Inter is served locally from `public/fonts`, with its OFL license alongside the fonts.

The desktop layout uses a 220px sidebar, 40px content gutters, white panels, a neutral gray background, and cobalt actions. Mobile uses compact gutters, bottom navigation, an identity menu, stacked panels, and horizontally scrollable data tables. Reduced-motion preferences are respected.

## Screen coverage

| Area | Routes and states |
| --- | --- |
| Identity | `/`: identity selection, loading, and authentication failure |
| Access | `/desk`: assigned scope and permission checks |
| Records | `/desk/calls`, `/desk/subscriptions`, `/desk/customers`, `/desk/customers/[id]`: filtered records and privacy-aware profiles |
| Refunds | `/desk/refunds`, `/desk/refunds/[id]`: queue, request review, allow/deny confirmation, recorded decisions |
| Credits | `/desk/credits`: ledger, balance adjustment preview, senior-only actions |
| Payments | `/desk/payments`: eligible refunds, payment confirmation, replay result, restricted access |
| Investigations | `/investigations`, `/cases/[id]`: queue, findings, evidence inspector, audit activity, safe credit confirmation, over-cap escalation, approval, application and replay, denied organization access |
| Security | `/security`: provider status and case audit |
| Demo | `/demo`: runnable backend scenarios and access-boundary links |

Financial actions still use the existing API authorization, approval, and idempotency checks. Provider configuration and backend execution are displayed separately. Switching identities clears cached data. Switching cases resets local review state. Every data screen includes loading, error, and empty states.

## Validation

- Web TypeScript, ESLint, and production build pass.
- All 25 existing API tests pass, including authorization and financial-action checks.
- Live browser interaction and visual checks remain unverified: the in-app browser was unavailable, and the environment rejected local server port binding. Responsive behavior is implemented but needs a browser review in an environment that can run the app.
