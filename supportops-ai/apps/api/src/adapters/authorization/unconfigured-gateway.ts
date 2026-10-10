import type { AuthorizationDecision, AuthorizationGateway, AuthorizationRequest } from "@supportops/shared";

/**
 * Fail closed. This does not call AgntID and must not invent a provider decision id.
 * Protected tool execution is blocked until a verified gateway replaces it.
 */
export class UnconfiguredAuthorizationGateway implements AuthorizationGateway {
  readonly integration = "UNCONFIGURED" as const;

  async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    return {
      status: "unavailable",
      reasonCode: "AGNTID_UNCONFIGURED",
      correlationId: request.correlationId,
    };
  }
}
