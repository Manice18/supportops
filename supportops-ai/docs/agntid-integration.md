# AgntID integration

Status: **BLOCKED**. The application reports `UNCONFIGURED`. Protected execution fails closed. No provider decision ids are generated.

## What was checked

- Product description of a customer-hosted runtime that intercepts MCP tool calls, evaluates policy, and writes an audit decision: https://agntid.ai/product-features and https://agntid.ai/faq
- Python SDK (alpha), including task wrapping around an MCP proxy: https://github.com/AGNTID-AI/agntid-python
- This workspace already contains the customer runtime compose at the repository root (`docker-compose.yml`), with the runtime UI on port 8080 and MCP on port 8082. That file was not modified.
- A public TypeScript AgntID SDK was not found. The Python client methods were not copied into this repo.

## What was not verified

- Authentication and bootstrap for a local runtime
- Task, identity, and argument context fields
- Policy syntax, including whether an amount parameter can be enforced
- Decision payload fields and audit export
- Failure behavior when the policy service is unreachable
- A TypeScript or raw HTTP contract this API can call without guessing

## Application contract

`AuthorizationGateway` in `@supportops/shared` is an application interface, not an AgntID SDK. `UnconfiguredAuthorizationGateway` always returns `status: "unavailable"` and omits `providerDecisionId`.

Do not add `AGNTID_*` variables until the official names are confirmed. Do not claim a denial or an allow came from AgntID unless the response was produced by the real runtime.

Phases 2–4 now run investigations and mock credits without a provider decision. Do not describe those results as AgntID allows or denials.

## Needed from the developer before Phase 5

- A running AgntID runtime and the official setup steps you want this demo to follow
- Credentials or bootstrap material, kept out of git
- The supported way for a TypeScript MCP client to send tool calls through that runtime
- Confirmation of which allow and deny rules the hackathon demo should configure
