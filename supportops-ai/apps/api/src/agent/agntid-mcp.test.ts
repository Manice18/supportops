import { describe, expect, it } from "vitest";
import { completeArguments, contextFor } from "./context.js";
import { readStep } from "./agntid-mcp.js";
import { promptsFor } from "./prompts.js";

describe("AgntID agent prompts", () => {
  it("gives every engineer an allow and a deny they can click", () => {
    for (const userId of ["user_maya", "user_lena", "user_priya", "user_sam", "user_jordan", "user_noor"]) {
      const prompts = promptsFor(userId);
      expect(prompts.some((prompt) => prompt.expect === "allow")).toBe(true);
      expect(prompts.some((prompt) => prompt.expect === "deny")).toBe(true);
    }
  });

  it("fills a missing orgId from the signed-in engineer's organization", () => {
    const context = contextFor(
      [{ id: "org_201", name: "BrightCart", plan: "payg", region: "us-east-1", status: "ACTIVE" }],
      "calculate the eligible credit",
    );
    expect(completeArguments("calculate_eligible_credit", {}, context)).toEqual({ orgId: "org_201" });
  });

  it("reads an AgntID deny without treating it as a handler run", () => {
    const raw = `event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              __agntid_execution_flow: {
                event_id: "audit-abc",
                correlation_id: "corr-def",
                steps: [
                  { step: "policy_evaluation", details: { allowed: false, policy_name: "agntid.tools.supportops.search_axiom_logs", reason: "orgId must equal org_101" } },
                ],
              },
            }),
          },
        ],
      },
    })}`;
    const step = readStep("supportops_search_axiom_logs", { orgId: "org_999" }, raw);
    expect(step.allowed).toBe(false);
    expect(step.handlerRan).toBe(false);
    expect(step.eventId).toBe("audit-abc");
    expect(step.policyName).toBe("agntid.tools.supportops.search_axiom_logs");
    expect(step.log).toContain("audit-abc");
  });

  it("keeps the full AgntID payload when the runtime returns a Python-style error", () => {
    const payload =
      "Error executing tool supportops_propose_credit: {'__agntid_execution_flow': {'tool_name': 'supportops.propose_credit', 'event_id': 'audit-be80d3cf5036', 'correlation_id': 'corr-024bced7a48f4be1', 'steps': [{'step': 'policy_evaluation', 'details': {'allowed': False, 'policy_name': 'agntid.tools.supportops.propose_credit', 'reason': 'kind must equal safe'}}]}}";
    const step = readStep("supportops_propose_credit", { kind: "eligible" }, payload);
    expect(step.allowed).toBe(false);
    expect(step.eventId).toBe("audit-be80d3cf5036");
    expect(step.reason).toBe("kind must equal safe");
    expect(step.log).toBe(payload);
  });
});