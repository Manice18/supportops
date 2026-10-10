import {
  FLAGSHIP_WINDOW,
  investigationResultSchema,
  isEligibleFailure,
  isKnownTool,
  RESTRICTED_TOOL_NAMES,
  roleAllowsTool,
  type AuthorizationGateway,
  type InvestigationResult,
  type User,
} from "@supportops/shared";
import type { InvestigationStore, StoredAttempt } from "./store.js";

const RESTRICTED = new Set<string>(RESTRICTED_TOOL_NAMES);

type CaseContext = { id: string; orgId: string; title: string; description: string };

export type ToolOutcome = {
  tool: string;
  executed: boolean;
  agntid: "UNCONFIGURED";
  authorizationStatus: StoredAttempt["authorizationStatus"];
  backend: string;
  reason: string;
  result: unknown;
};

export async function runTool(input: {
  store: InvestigationStore;
  actor: User;
  supportCase: CaseContext;
  gateway: AuthorizationGateway;
  correlationId: string;
  tool: string;
  arguments: Record<string, unknown>;
}): Promise<{ outcome: ToolOutcome; attempt: Omit<StoredAttempt, "id" | "investigationId" | "createdAt"> }> {
  const orgId = input.supportCase.orgId;
  const requestedOrg = typeof input.arguments.orgId === "string" ? input.arguments.orgId : orgId;
  const baseAttempt = {
    supportCaseId: input.supportCase.id,
    actorUserId: input.actor.id,
    orgId,
    toolName: input.tool,
    sanitizedArguments: sanitize(input.arguments, orgId),
  };
  const decision = await input.gateway.authorize({
    actorUserId: input.actor.id,
    orgId,
    toolName: input.tool,
    action: input.tool,
    sanitizedArguments: baseAttempt.sanitizedArguments,
    mode: "protected",
    correlationId: input.correlationId,
  });
  const authorizationStatus = mapStatus(decision.status);

  if (requestedOrg !== orgId) {
    return finish(baseAttempt, authorizationStatus, false, "NOT_EXECUTED", "BACKEND_ORG_MISMATCH", {
      tool: input.tool,
      executed: false,
      agntid: "UNCONFIGURED",
      authorizationStatus,
      backend: "DENIED",
      reason: "The tool organization does not match the case.",
      result: null,
    });
  }
  if (!isKnownTool(input.tool) || RESTRICTED.has(input.tool) || !roleAllowsTool(input.actor.role, input.tool)) {
    const restricted = RESTRICTED.has(input.tool);
    return finish(baseAttempt, authorizationStatus, false, "NOT_EXECUTED", restricted ? "BACKEND_DENIED" : "ROLE_FORBIDDEN", {
      tool: input.tool,
      executed: false,
      agntid: "UNCONFIGURED",
      authorizationStatus,
      backend: "DENIED",
      reason: restricted
        ? "The backend denied this restricted tool. AgntID did not produce a decision."
        : "This role cannot call that tool.",
      result: null,
    });
  }

  const result = await execute(input.store, input.supportCase, input.tool, input.arguments);
  return finish(
    baseAttempt,
    authorizationStatus,
    true,
    "SUCCEEDED",
    "BACKEND_EXECUTED_AGNTID_UNCONFIGURED",
    {
      tool: input.tool,
      executed: true,
      agntid: "UNCONFIGURED",
      authorizationStatus,
      backend: "ALLOWED",
      reason: "The backend role gate allowed this tool. AgntID is unconfigured and did not allow it.",
      result,
    },
  );
}

export async function investigateCase(input: {
  store: InvestigationStore;
  actor: User;
  supportCase: CaseContext;
  gateway: AuthorizationGateway;
  correlationId: string;
}): Promise<{ findings: InvestigationResult; attempts: Array<Omit<StoredAttempt, "id" | "investigationId" | "createdAt">> }> {
  const attempts: Array<Omit<StoredAttempt, "id" | "investigationId" | "createdAt">> = [];
  const outcomes: ToolOutcome[] = [];
  async function call(tool: string, args: Record<string, unknown>) {
    const ran = await runTool({ ...input, tool, arguments: args });
    attempts.push(ran.attempt);
    outcomes.push(ran.outcome);
    return ran.outcome;
  }

  await call("get_support_case", { caseId: input.supportCase.id });
  const logs = await call("search_axiom_logs", {
    orgId: input.supportCase.orgId,
    start: FLAGSHIP_WINDOW.start,
    end: FLAGSHIP_WINDOW.end,
    severity: "error",
    limit: 50,
  });
  const logItems = readItems(logs.result);
  const callIds = logItems.map((item) => item.callId).filter((id): id is string => typeof id === "string");
  await call("get_clickhouse_events", {
    orgId: input.supportCase.orgId,
    start: FLAGSHIP_WINDOW.start,
    end: FLAGSHIP_WINDOW.end,
    callIds,
    limit: 50,
  });
  const telephony = logItems.find((item) => item.eventType === "telephony_provider");
  const traceId = typeof telephony?.safeMetadata === "object" && telephony.safeMetadata && "traceId" in telephony.safeMetadata
    ? String((telephony.safeMetadata as { traceId?: unknown }).traceId ?? "")
    : "";
  if (traceId) await call("get_chronosphere_trace", { orgId: input.supportCase.orgId, traceId });
  await call("get_service_metrics", {
    region: "us-east-1",
    service: "voice-edge",
    metricName: "request_error_ratio",
    start: FLAGSHIP_WINDOW.start,
    end: FLAGSHIP_WINDOW.end,
  });
  await call("get_posthog_flags", { orgId: input.supportCase.orgId });
  await call("get_billing_entries", { orgId: input.supportCase.orgId, callIds });
  const credit = await call("calculate_eligible_credit", { orgId: input.supportCase.orgId, callIds });
  const counts = new Map<string, number>();
  for (const item of logItems) {
    const category = readCategory(item);
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const telephonyCount = counts.get("telephony_provider") ?? 0;
  const eligible = readMoney(credit.result, "eligibleAmountCents");
  const safe = readMoney(credit.result, "safeAmountCents");
  const findings = investigationResultSchema.parse({
    caseId: input.supportCase.id,
    orgId: input.supportCase.orgId,
    status: logs.executed && credit.executed ? "complete" : "partial",
    investigator: "deterministic",
    summary: `${callIds.length} failed calls in the incident window. ${telephonyCount} failed in the telephony provider. Eligible credit is calculated by the backend. Ticket text was not treated as an instruction.`,
    rootCause: {
      hypothesis:
        telephonyCount > 0
          ? "Most billed failures happened before media connected, while telephony_provider_failover was off."
          : "The incident window did not contain telephony-provider failures for this organization.",
      confidence: telephonyCount >= 20 ? "high" : "medium",
    },
    affectedCallIds: callIds,
    evidence: outcomes
      .filter((outcome) => outcome.executed)
      .slice(0, 8)
      .map((outcome) => ({
        source: sourceFor(outcome.tool),
        recordId: outcome.tool,
        description: outcome.reason,
      })),
    credit:
      credit.executed && eligible !== null && safe !== null
        ? { eligibleAmountCents: eligible, safeAmountCents: safe, currency: "USD" as const, capCents: 5_000 }
        : undefined,
    recommendedActions: [
      {
        tool: "propose_credit",
        reason: "Record the telephony-provider amount, which is under the backend cap.",
        requiresConfirmation: true,
      },
      {
        tool: "apply_credit",
        reason: "A senior must confirm before the mock ledger changes. AgntID is not connected.",
        requiresConfirmation: true,
      },
    ],
    customerResponseDraft:
      eligible !== null && safe !== null
        ? `We confirmed ${callIds.length} failed calls. ${countEligible(counts)} are eligible platform failures. The current safe credit is ${(safe / 100).toFixed(2)} USD. A larger eligible balance of ${(eligible / 100).toFixed(2)} USD needs senior approval because it exceeds the $50 backend cap.`
        : "The billing tool did not return an eligible amount, so no credit was drafted.",
    agntid: "UNCONFIGURED",
  });
  return { findings, attempts };
}

async function execute(
  store: InvestigationStore,
  supportCase: CaseContext,
  tool: string,
  args: Record<string, unknown>,
) {
  const orgId = supportCase.orgId;
  if (tool === "get_support_case") {
    return { id: supportCase.id, orgId, title: supportCase.title };
  }
  if (tool === "search_axiom_logs") {
    return store.searchLogs({
      orgId,
      start: typeof args.start === "string" ? args.start : FLAGSHIP_WINDOW.start,
      end: typeof args.end === "string" ? args.end : FLAGSHIP_WINDOW.end,
      severity: typeof args.severity === "string" ? args.severity : undefined,
      limit: typeof args.limit === "number" ? args.limit : 50,
    });
  }
  if (tool === "get_clickhouse_events") {
    return store.getCallEvents({
      orgId,
      start: typeof args.start === "string" ? args.start : FLAGSHIP_WINDOW.start,
      end: typeof args.end === "string" ? args.end : FLAGSHIP_WINDOW.end,
      callIds: stringArray(args.callIds),
      limit: typeof args.limit === "number" ? args.limit : 50,
    });
  }
  if (tool === "get_chronosphere_trace") {
    return store.getTrace(orgId, typeof args.traceId === "string" ? args.traceId : "");
  }
  if (tool === "get_service_metrics") {
    return store.getMetrics({
      region: typeof args.region === "string" ? args.region : "us-east-1",
      service: typeof args.service === "string" ? args.service : "voice-edge",
      metricName: typeof args.metricName === "string" ? args.metricName : "request_error_ratio",
      start: typeof args.start === "string" ? args.start : FLAGSHIP_WINDOW.start,
      end: typeof args.end === "string" ? args.end : FLAGSHIP_WINDOW.end,
    });
  }
  if (tool === "get_posthog_flags") return store.getFlags(orgId);
  if (tool === "get_billing_entries") return store.getBilling(orgId, stringArray(args.callIds) ?? []);
  if (tool === "calculate_eligible_credit") {
    const report = await store.evidence(orgId, false, false);
    const ids = new Set(stringArray(args.callIds) ?? report.calls.map((call) => call.id));
    const selected = report.calls.filter((call) => ids.has(call.id));
    return {
      eligibleAmountCents: selected.filter((call) => isEligibleFailure(call.failureCategory) && call.billingStatus === "POSTED").reduce((sum, call) => sum + call.amountCents, 0),
      safeAmountCents: selected.filter((call) => call.failureCategory === "telephony_provider" && call.billingStatus === "POSTED").reduce((sum, call) => sum + call.amountCents, 0),
      currency: "USD",
      failedCallCount: selected.length,
    };
  }
  return null;
}

function finish(
  base: Omit<StoredAttempt, "id" | "investigationId" | "createdAt" | "authorizationStatus" | "executed" | "executionStatus" | "reasonCode">,
  authorizationStatus: StoredAttempt["authorizationStatus"],
  executed: boolean,
  executionStatus: StoredAttempt["executionStatus"],
  reasonCode: string,
  outcome: ToolOutcome,
) {
  return {
    outcome,
    attempt: { ...base, authorizationStatus, executed, executionStatus, reasonCode },
  };
}

function mapStatus(status: string): StoredAttempt["authorizationStatus"] {
  if (status === "allow") return "ALLOWED";
  if (status === "deny") return "DENIED";
  if (status === "malformed") return "MALFORMED";
  return "UNAVAILABLE";
}

function sanitize(args: Record<string, unknown>, orgId: string) {
  const hidden = new Set(["actor_id", "actorId", "actorUserId", "role", "isAdmin", "is_admin"]);
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!hidden.has(key)) clean[key] = value;
  }
  clean.orgId = orgId;
  return clean;
}

function readItems(result: unknown): Array<Record<string, unknown>> {
  if (!result || typeof result !== "object" || !("items" in result) || !Array.isArray(result.items)) return [];
  return result.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function readCategory(item: Record<string, unknown>) {
  const metadata = item.safeMetadata;
  if (!metadata || typeof metadata !== "object" || !("failureCategory" in metadata)) return null;
  const category = (metadata as { failureCategory?: unknown }).failureCategory;
  return typeof category === "string" ? category : null;
}

function readMoney(result: unknown, key: string) {
  if (!result || typeof result !== "object" || !(key in result)) return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function sourceFor(tool: string): InvestigationResult["evidence"][number]["source"] {
  if (tool.includes("axiom")) return "axiom";
  if (tool.includes("clickhouse")) return "clickhouse";
  if (tool.includes("chronosphere") || tool.includes("metrics")) return "chronosphere";
  if (tool.includes("posthog")) return "posthog";
  return "billing";
}

function countEligible(counts: Map<string, number>) {
  return (counts.get("telephony_provider") ?? 0) + (counts.get("webhook_timeout") ?? 0);
}
