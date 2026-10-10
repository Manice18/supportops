# Implementation status

Last updated: 2026-10-10

## Milestone

Phases 1–4 are in `supportops-ai/`: role-scoped desk, the 47-call incident, a deterministic investigator, and backend credit actions. AgntID remains unconfigured. The root runtime compose was not changed.

## Completed

- pnpm workspace with Next.js, Fastify, Prisma, shared Zod schemas, and deterministic fixtures.
- Postgres on host port 5433, migrations, seed, and `pnpm demo:reset`.
- Signed session token. The role claim must match the database user. `actor_id`, `role`, and `isAdmin` in the request are rejected.
- Assignment plus plan visibility. Pay-as-you-go and enterprise engineers see only their segment. Both senior roles see every assigned organization, including internal. A senior with no assignment row is still denied.
- Desk lists and senior mutations for refunds, credits, and mock payment returns. Line engineers do not receive billing secrets.
- Tool checks return `enforcedBy: api_role_gate`, `executed: false`, and `agntid: UNCONFIGURED`. Destructive tools stay denied for every support role. No provider decision id is created.
- Health reports `agntid: UNCONFIGURED`. The authorization gateway returns `unavailable`.
- The Northwind incident has 47 failed billed calls, with logs, request events, traces, regional metrics, and feature flags.
- A deterministic investigator runs those tools and calculates eligibility. It does not call a model.
- Safe credits apply once for a senior. The full eligible amount stops at the $50 backend cap until a senior approval. Restricted tools do not execute.
- MCP server on port 4050 exposes log search, billing reads, and a non-executing `set_feature_flag`.

## Verified

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 25 tests passed. These use an in-memory repository and the unconfigured gateway. They are not AgntID integration tests.
- `pnpm db:migrate` and `pnpm demo:reset` against local Postgres on port 5433.
- Live API evidence for the flagship case: 47 failed calls, $57.00 eligible, $45.00 safe, 47 logs.
- Browser: Jordan ran the investigator, proposed the $45 safe credit, and applied it. The ledger showed those charges as credited and the safe balance at $0. The demo database was reset afterward.
- MCP process listened on port 4050.

## AgntID

Status: **BLOCKED / UNCONFIGURED**.

Official product pages and the Python SDK were reviewed. No TypeScript SDK was verified, and no policy or decision payload was exercised. See `docs/agntid-integration.md`.

## Not in this milestone

- A real AgntID allow or deny. No provider decision ids exist.
- A model-backed tool loop. Set `AI_PROVIDER_API_KEY` later only after choosing a provider; the current investigator does not read that key.
- Isolated baseline replay.

## Next milestone

Phase 5 — connect the documented AgntID runtime and replace the unconfigured gateway. Do not describe the current backend cap as an AgntID decision.
