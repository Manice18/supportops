# Architecture

Phase 1 path:

```text
Next.js desk  -->  Fastify API  -->  session cookie
                         |
                         +--> assignment + plan visibility + role gate
                         |
                         +--> PostgreSQL (users, orgs, cases, desk records)
```

The target path adds an agent, a server-side MCP client, and AgntID between the agent and tool handlers. That path is not wired. `UnconfiguredAuthorizationGateway` returns `unavailable` and does not include a provider decision id. Callers must treat anything other than `allow` as do-not-execute.

Desk and investigation allow or deny results come from the API role gate and backend billing rules. They are labeled with `agntid: UNCONFIGURED`. A session still needs an organization assignment. A senior with no assignment row cannot read a case. A pay-as-you-go role cannot read an enterprise or internal organization even if a row is present.

The investigator reads the flagship fixtures through the same tool handlers the MCP server exposes. It does not call a model. Credit application is a backend transaction with a $50 cap unless a senior approval exists. That cap is not an AgntID decision.

Observability and billing ports live in `@supportops/shared` as TypeScript interfaces only. There are no mock query implementations in this milestone.
