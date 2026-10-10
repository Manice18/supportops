import { describe, expect, it } from "vitest";
import { isExecutionAllowed } from "@supportops/shared";
import { UnconfiguredAuthorizationGateway } from "./unconfigured-gateway.js";

describe("UnconfiguredAuthorizationGateway", () => {
  it("fails closed and does not invent a provider decision id", async () => {
    const gateway = new UnconfiguredAuthorizationGateway();
    const decision = await gateway.authorize({
      actorUserId: "user_maya",
      orgId: "org_101",
      toolName: "apply_credit",
      action: "apply",
      sanitizedArguments: { amountCents: 500 },
      mode: "protected",
      correlationId: "corr_test",
    });

    expect(gateway.integration).toBe("UNCONFIGURED");
    expect(decision.status).toBe("unavailable");
    expect(decision.reasonCode).toBe("AGNTID_UNCONFIGURED");
    expect(decision.correlationId).toBe("corr_test");
    expect(decision.providerDecisionId).toBeUndefined();
    expect(isExecutionAllowed(decision)).toBe(false);
  });
});
