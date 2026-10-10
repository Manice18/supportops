import type { Organization } from "@supportops/shared";

export type EngineerContext = {
  orgId: string;
  caseId: string;
  region: string;
  traceId: string;
};

const ORGS: Record<string, { name: string; caseId: string; region: string; traceId: string }> = {
  org_101: { name: "northwind", caseId: "case_flagship_47", region: "us-east-1", traceId: "trace_fw_001" },
  org_102: { name: "harbor", caseId: "case_harbor_webhook", region: "eu-west-1", traceId: "trace_ruth_1" },
  org_201: { name: "brightcart", caseId: "case_brightcart_usage", region: "us-east-1", traceId: "trace_call_mia_1" },
  org_202: { name: "lumen", caseId: "case_lumen_invoice", region: "us-west-2", traceId: "trace_call_ada_1" },
  org_999: { name: "contoso", caseId: "case_contoso_flags", region: "us-west-2", traceId: "trace_fw_001" },
};

const WINDOW = {
  start: "2026-10-09T00:00:00.000Z",
  end: "2026-10-10T00:00:00.000Z",
};

export function contextFor(organizations: Organization[], message: string): EngineerContext {
  const mentioned = Object.entries(ORGS).find(([id, org]) => {
    const text = message.toLowerCase();
    return text.includes(id) || text.includes(org.name);
  });
  const orgId = mentioned?.[0] ?? organizations.find((org) => org.id === "org_101")?.id ?? organizations[0]?.id ?? "org_101";
  const known = ORGS[orgId];
  const assigned = organizations.find((org) => org.id === orgId);
  return {
    orgId,
    caseId: known?.caseId ?? "case_flagship_47",
    region: assigned?.region ?? known?.region ?? "us-east-1",
    traceId: known?.traceId ?? "trace_fw_001",
  };
}

export function completeArguments(tool: string, args: Record<string, unknown>, context: EngineerContext): Record<string, unknown> {
  const name = tool.replace(/^supportops_/, "");
  const orgId = stringArg(args.orgId) ?? context.orgId;
  const filled: Record<string, unknown> = { ...args, orgId };
  const set = (key: string, value: unknown) => {
    if (filled[key] === undefined || filled[key] === "") filled[key] = value;
  };
  if (name === "search_axiom_logs" || name === "get_clickhouse_events" || name === "get_service_metrics") {
    set("start", WINDOW.start);
    set("end", WINDOW.end);
  }
  if (name === "search_axiom_logs") set("limit", 5);
  if (name === "get_clickhouse_events") set("limit", 5);
  if (name === "get_support_case" || name === "propose_credit" || name === "apply_credit" || name === "create_escalation") {
    set("caseId", context.caseId);
  }
  if (name === "get_chronosphere_trace") set("traceId", context.traceId);
  if (name === "get_service_metrics") {
    set("region", context.region);
    set("service", "voice-edge");
    set("metricName", "request_error_ratio");
  }
  if (name === "get_billing_entries") set("callIds", []);
  if (name === "propose_credit") set("kind", "safe");
  if (name === "apply_credit") set("idempotencyKey", `propose:${String(filled.caseId)}:safe`);
  if (name === "create_escalation") {
    set("amountCents", 4500);
    set("reason", "Review the credit for this organization.");
  }
  if (name === "update_org_config") {
    set("configKey", "support_note");
    set("configValue", "checked");
  }
  if (name === "set_feature_flag") {
    set("flagKey", "telephony_provider_failover");
    set("enabled", "false");
  }
  if (name === "delete_call_records") set("confirm", "no");
  return filled;
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
