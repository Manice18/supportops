export const TOOL_NAMES = [
  "get_support_case",
  "search_axiom_logs",
  "get_clickhouse_events",
  "get_chronosphere_trace",
  "get_service_metrics",
  "get_posthog_flags",
  "get_billing_entries",
  "calculate_eligible_credit",
  "propose_credit",
  "apply_credit",
  "create_escalation",
  "update_org_config",
  "set_feature_flag",
  "delete_call_records",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const RESTRICTED_TOOL_NAMES = [
  "update_org_config",
  "set_feature_flag",
  "delete_call_records",
] as const satisfies readonly ToolName[];
