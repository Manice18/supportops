import type { ToolName } from "./tools.js";
import { TOOL_NAMES } from "./tools.js";
import type { UserRole } from "./api.js";

export type SupportSegment = "payg" | "enterprise" | "all";

export const DASHBOARD_ACTIONS = [
  "view_call_logs",
  "view_subscriptions",
  "view_customer_profile",
  "view_customer_billing",
  "propose_credit",
  "adjust_credit",
  "decide_refund",
  "return_payment",
] as const;

export type DashboardAction = (typeof DASHBOARD_ACTIONS)[number];

const LINE_ACTIONS: readonly DashboardAction[] = [
  "view_call_logs",
  "view_subscriptions",
  "view_customer_profile",
  "propose_credit",
];

const SENIOR_ACTIONS: readonly DashboardAction[] = [
  ...LINE_ACTIONS,
  "view_customer_billing",
  "adjust_credit",
  "decide_refund",
  "return_payment",
];

const PAYG_TOOLS: readonly ToolName[] = [
  "get_support_case",
  "search_axiom_logs",
  "get_clickhouse_events",
  "get_billing_entries",
  "calculate_eligible_credit",
  "propose_credit",
  "create_escalation",
];

const ENTERPRISE_TOOLS: readonly ToolName[] = [
  ...PAYG_TOOLS,
  "get_chronosphere_trace",
  "get_posthog_flags",
];

const SENIOR_TOOLS: readonly ToolName[] = [...ENTERPRISE_TOOLS, "get_service_metrics", "apply_credit"];

export function isSeniorRole(role: UserRole): boolean {
  return role === "CSE_PAYG_SENIOR" || role === "CSE_ENTERPRISE_SENIOR";
}

export function segmentForRole(role: UserRole): SupportSegment {
  if (isSeniorRole(role)) return "all";
  if (role === "CSE_PAYG") return "payg";
  return "enterprise";
}

export function orgPlanVisibleToRole(role: UserRole, plan: string): boolean {
  if (isSeniorRole(role)) return true;
  if (role === "CSE_PAYG") return plan === "payg";
  return plan === "enterprise";
}

export function actionsForRole(role: UserRole): DashboardAction[] {
  return [...(isSeniorRole(role) ? SENIOR_ACTIONS : LINE_ACTIONS)];
}

export function roleAllowsAction(role: UserRole, action: DashboardAction): boolean {
  return actionsForRole(role).includes(action);
}

export function toolsForRole(role: UserRole): ToolName[] {
  if (isSeniorRole(role)) return [...SENIOR_TOOLS];
  if (role === "CSE_ENTERPRISE") return [...ENTERPRISE_TOOLS];
  return [...PAYG_TOOLS];
}

export function roleAllowsTool(role: UserRole, tool: ToolName): boolean {
  return toolsForRole(role).includes(tool);
}

export function isKnownTool(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}
