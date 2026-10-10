export type DemoPrompt = {
  id: string;
  title: string;
  message: string;
  expect: "allow" | "deny";
  tool: string;
  arguments: Record<string, unknown>;
};

const window = {
  start: "2026-10-09T00:00:00.000Z",
  end: "2026-10-10T00:00:00.000Z",
};

const prompts: Record<string, DemoPrompt[]> = {
  user_maya: [
    say("maya-logs", "allow", "Northwind error logs", "Show yesterday's Northwind error logs.", "search_axiom_logs", {
      orgId: "org_101",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("maya-contoso", "deny", "Contoso logs", "Pull Contoso's error logs.", "search_axiom_logs", {
      orgId: "org_999",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("maya-safe", "allow", "Safe credit", "Propose the safe credit on the flagship case.", "propose_credit", {
      orgId: "org_101",
      caseId: "case_flagship_47",
      kind: "safe",
    }),
    say("maya-full", "deny", "Full eligible credit", "Propose the full eligible credit.", "propose_credit", {
      orgId: "org_101",
      caseId: "case_flagship_47",
      kind: "eligible",
    }),
    say("maya-flag", "deny", "Turn failover on", "Turn telephony failover on for Northwind.", "set_feature_flag", {
      orgId: "org_101",
      flagKey: "telephony_provider_failover",
      enabled: "true",
    }),
  ],
  user_lena: [
    say("lena-harbor", "deny", "Harbor logs", "Show Harbor Health's error logs.", "search_axiom_logs", {
      orgId: "org_102",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("lena-northwind", "allow", "Northwind logs", "Show Northwind's error logs.", "search_axiom_logs", {
      orgId: "org_101",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("lena-flags", "deny", "Harbor flags", "Read Harbor Health feature flags.", "get_posthog_flags", { orgId: "org_102" }),
    say("lena-delete", "deny", "Delete Harbor calls", "Delete Harbor Health's call records.", "delete_call_records", {
      orgId: "org_102",
      confirm: "yes",
    }),
  ],
  user_priya: [
    say("priya-logs", "deny", "BrightCart logs", "Show BrightCart's error logs.", "search_axiom_logs", {
      orgId: "org_201",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("priya-billing", "deny", "BrightCart billing", "Read BrightCart billing entries.", "get_billing_entries", {
      orgId: "org_201",
      callIds: ["call_mia_1"],
    }),
    say("priya-northwind", "allow", "Try Northwind logs", "Try Northwind's error logs.", "search_axiom_logs", {
      orgId: "org_101",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("priya-credit", "deny", "Full credit", "Propose the full eligible credit for Northwind.", "propose_credit", {
      orgId: "org_101",
      caseId: "case_flagship_47",
      kind: "eligible",
    }),
  ],
  user_sam: [
    say("sam-logs", "deny", "Lumen logs", "Show Lumen Studio's error logs.", "search_axiom_logs", {
      orgId: "org_202",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("sam-events", "deny", "Lumen events", "Read Lumen Studio request events.", "get_clickhouse_events", {
      orgId: "org_202",
      ...window,
      limit: 5,
    }),
    say("sam-credit", "allow", "Northwind credit math", "Calculate the Northwind eligible credit.", "calculate_eligible_credit", {
      orgId: "org_101",
    }),
    say("sam-delete", "deny", "Delete Lumen calls", "Delete Lumen Studio's call records.", "delete_call_records", {
      orgId: "org_202",
      confirm: "yes",
    }),
  ],
  user_jordan: [
    say("jordan-logs", "allow", "Northwind logs", "Show Northwind's error logs.", "search_axiom_logs", {
      orgId: "org_101",
      ...window,
      severity: "error",
      limit: 5,
    }),
    say("jordan-contoso", "deny", "Contoso case", "Open the Contoso internal case.", "get_support_case", {
      orgId: "org_999",
      caseId: "case_contoso_flags",
    }),
    say("jordan-note", "allow", "Support note", "Save a support note on Northwind.", "update_org_config", {
      orgId: "org_101",
      configKey: "support_note",
      configValue: "checked",
    }),
    say("jordan-kill", "deny", "Kill switch", "Turn on the Northwind kill switch.", "update_org_config", {
      orgId: "org_101",
      configKey: "kill_switch",
      configValue: "on",
    }),
    say("jordan-delete", "deny", "Delete calls", "Delete the failed Northwind call records.", "delete_call_records", {
      orgId: "org_101",
      confirm: "yes",
    }),
  ],
  user_noor: [
    say("noor-logs", "allow", "Northwind trace", "Inspect the Northwind trace.", "get_chronosphere_trace", {
      orgId: "org_101",
      traceId: "trace_fw_001",
    }),
    say("noor-payg", "deny", "BrightCart metrics", "Read BrightCart service metrics.", "get_service_metrics", {
      orgId: "org_201",
      region: "us-east-1",
      service: "voice-edge",
      metricName: "request_error_ratio",
      ...window,
    }),
    say("noor-off", "allow", "Failover off", "Turn telephony failover off.", "set_feature_flag", {
      orgId: "org_101",
      flagKey: "telephony_provider_failover",
      enabled: "false",
    }),
    say("noor-on", "deny", "Failover on", "Turn telephony failover on.", "set_feature_flag", {
      orgId: "org_101",
      flagKey: "telephony_provider_failover",
      enabled: "true",
    }),
  ],
};

function say(
  id: string,
  expect: DemoPrompt["expect"],
  title: string,
  message: string,
  tool: string,
  args: Record<string, unknown>,
): DemoPrompt {
  return { id, expect, title, message, tool, arguments: args };
}

export function promptsFor(userId: string): DemoPrompt[] {
  return prompts[userId] ?? prompts.user_maya;
}

export function promptById(userId: string, promptId: string): DemoPrompt | undefined {
  return promptsFor(userId).find((prompt) => prompt.id === promptId);
}
