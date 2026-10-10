# SupportOps AI

Internal support-engineering desk for a hackathon MVP. Demo sessions carry a signed role token. The API role gate limits tickets, billing fields, refunds, credits, payment returns, and tool checks. AgntID is not connected, so those allow and deny results are not AgntID decisions.

The AgntID runtime compose at the repository root is separate. Do not replace it. Postgres for this app lives in `supportops-ai/docker-compose.yml`.

## Run locally

```bash
cd supportops-ai
cp .env.example .env
# Put a long random value in SESSION_SECRET before starting the API.
make up
```

From the repository root, `make up` does the same thing. Individual targets:

```text
make db       # Postgres on port 5433
make api      # Fastify on port 4000
make web      # Next.js on port 3000
make mcp      # MCP tools on port 4050
make agntid   # existing root runtime compose, not used by this app yet
make down
```

Postgres is published on host port **5433** so it does not collide with another local database on 5432.

- Web: http://localhost:3000
- API: http://localhost:4000/health

The browser talks only to port 3000. Next.js proxies `/api` and `/health` to the API so the demo session cookie stays on one origin.

There is no password. Open http://localhost:3000 and pick an identity. A senior role with no assignment row is still denied. Destructive tools (`update_org_config`, `set_feature_flag`, `delete_call_records`) stay denied for every support role, including seniors.

| Email | Role | What you can test |
| --- | --- | --- |
| `maya.chen@supportops.demo` | CSE · Enterprise | Northwind Voice only. Call logs and subscriptions. Email and card details hidden. Refund, credit, and payment actions locked. Enterprise tools such as traces are allowed by the role gate; `apply_credit` is denied. |
| `lena.vogel@supportops.demo` | CSE · Enterprise | Harbor Health only. Same limits as Maya. |
| `priya.nair@supportops.demo` | CSE · Pay as you go | BrightCart only. Northwind and Harbor tickets are forbidden. Trace and flag tools are denied. |
| `sam.okonkwo@supportops.demo` | CSE · Pay as you go | Lumen Studio only. Same limits as Priya. |
| `jordan.hale@supportops.demo` | Senior CSE · Enterprise | Every organization, including Contoso Internal. Allow or deny refunds, give or reduce credits, and return an allowed refund to the mock card provider. |
| `noor.hassan@supportops.demo` | Senior CSE · Pay as you go | Same whole-desk access as Jordan. |

The Desk page shows the verified token claims and a tool check. The check reports `enforcedBy: api_role_gate` and `agntid: UNCONFIGURED`. It does not execute the tool and it does not include a provider decision id.

## Scripts

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm db:seed
pnpm demo:reset
```

`pnpm db:seed` and `pnpm demo:reset` refuse to run unless `DEMO_MODE=true`, `NODE_ENV` is not `production`, and `DATABASE_URL` points at localhost.

## What works now

- Seeded engineers, organizations, the 47-call Northwind incident, correlated logs, events, traces, metrics, flags, and billing charges.
- Deterministic investigation that calls those tools and calculates the eligible credit. Seniors can propose, approve an over-cap amount, and apply it once. Restricted tools do not run.
- Signed session token. The role in that token must match the database user. `actor_id`, `role`, and `isAdmin` in the request are rejected.
- Case list limited to assigned organizations whose plan matches the role. Pay-as-you-go and enterprise engineers do not see the other segment. Both senior roles see every assigned organization.
- Desk pages for calls, subscriptions, customers, refunds, credits, and payment returns. Line engineers see locked actions. Seniors can decide refunds, change credits, and return money to `mock_card`.
- Health reports AgntID as `UNCONFIGURED`. Tool checks are enforced by the API role gate.

## What does not work yet

- Real AgntID decisions. See `docs/agntid-integration.md`. No provider decision ids are invented.
- A model-backed agent. The investigator is deterministic and calls the same tools a model would use.
- Isolated before/after replay. Reset the local database with `make reset`.

## Known limitations

Demo login is not production authentication. Protected tool execution fails closed until a verified AgntID integration exists. Reset the database only on a local demo Postgres instance.
