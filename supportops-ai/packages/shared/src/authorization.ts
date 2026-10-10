import type { IntegrationStatus } from "./api.js";

export type EnforcementMode = "protected" | "baseline";

export type AuthorizationStatus = "allow" | "deny" | "unavailable" | "malformed";

/**
 * Application-owned request. This is not an AgntID SDK type.
 * Actor identity is filled by the API from the session, never from model or client fields.
 */
export type AuthorizationRequest = {
  actorUserId: string;
  orgId: string;
  toolName: string;
  action: string;
  sanitizedArguments: Record<string, unknown>;
  mode: EnforcementMode;
  correlationId: string;
};

/**
 * `providerDecisionId` is optional and must be copied from a real provider payload.
 * Callers must not invent one when the gateway is unconfigured.
 */
export type AuthorizationDecision = {
  status: AuthorizationStatus;
  reasonCode: string;
  correlationId: string;
  providerDecisionId?: string;
};

export interface AuthorizationGateway {
  readonly integration: IntegrationStatus;
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}

export function isExecutionAllowed(decision: AuthorizationDecision): boolean {
  return decision.status === "allow";
}
