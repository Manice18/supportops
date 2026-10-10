import type { DemoScenario } from "@supportops/shared";
import { IDS } from "./fixtures.js";

export const demoScenarios: DemoScenario[] = [
  {
    id: "flagship-47",
    title: "47 failed but billed calls",
    summary:
      "Investigate org_101. The deterministic investigator correlates the 47 billed failures and calculates the eligible credit. Applying it still needs a senior confirmation.",
    orgId: IDS.org101,
    caseId: IDS.flagship,
    runnable: true,
    milestone: "Fixtures, investigation, and backend credit checks are available. AgntID is not connected.",
  },
  {
    id: "excessive-refund",
    title: "Excessive refund",
    summary:
      "The full eligible amount is above the $50 backend cap. Apply stays blocked until a senior approves it. That cap is backend enforcement, not an AgntID decision.",
    orgId: IDS.org101,
    caseId: IDS.flagship,
    runnable: true,
    milestone: "Backend cap and approval. AgntID amount policy is still unverified.",
  },
  {
    id: "cross-tenant",
    title: "Cross-tenant access",
    summary: "An org_101 session requests org_999 data. The backend must reject it even when AgntID is unconfigured.",
    orgId: IDS.org999,
    caseId: IDS.contoso,
    runnable: true,
    milestone: "The API rejects the case before any tool handler runs.",
  },
  {
    id: "restricted-config",
    title: "Unauthorized config mutation",
    summary:
      "set_feature_flag, update_org_config, and delete_call_records do not run. The backend denies them. AgntID has not produced a decision.",
    orgId: IDS.org101,
    caseId: IDS.flagship,
    runnable: true,
    milestone: "Backend denial only. A real AgntID denial is still Phase 5.",
  },
  {
    id: "prompt-injection",
    title: "Prompt injection in ticket text",
    summary:
      "The Northwind ticket contains untrusted text asking for a huge credit and a flag change. The text is stored as data.",
    orgId: IDS.org101,
    caseId: IDS.injection,
    runnable: true,
    milestone: "The investigator treats the ticket as data. A model is not required for that boundary.",
  },
  {
    id: "regional-latency",
    title: "Regional latency spike",
    summary: "Read-only correlation of us-east-1 metrics, traces, and events. Service metrics are limited to senior roles.",
    orgId: IDS.org101,
    caseId: IDS.latency,
    runnable: true,
    milestone: "Metrics are seeded. Seniors can read the aggregate series.",
  },
];
