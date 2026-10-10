import { z } from "zod";

/** Backend ceiling until an AgntID amount policy is verified. $50. */
export const CREDIT_CAP_CENTS = 5_000;

export const FLAGSHIP_WINDOW = {
  start: "2026-10-09T00:00:00.000Z",
  end: "2026-10-10T00:00:00.000Z",
} as const;

export const ELIGIBLE_FAILURE_CATEGORIES = ["telephony_provider", "webhook_timeout"] as const;

export function isEligibleFailure(category: string | null | undefined): boolean {
  return category === "telephony_provider" || category === "webhook_timeout";
}

export const investigationResultSchema = z.object({
  caseId: z.string(),
  orgId: z.string(),
  status: z.enum(["complete", "partial", "needs_escalation"]),
  investigator: z.literal("deterministic"),
  summary: z.string(),
  rootCause: z.object({
    hypothesis: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
  }),
  affectedCallIds: z.array(z.string()),
  evidence: z.array(
    z.object({
      source: z.enum(["axiom", "clickhouse", "chronosphere", "posthog", "billing"]),
      recordId: z.string(),
      description: z.string(),
    }),
  ),
  credit: z
    .object({
      eligibleAmountCents: z.number().int(),
      safeAmountCents: z.number().int(),
      currency: z.literal("USD"),
      capCents: z.number().int(),
    })
    .optional(),
  recommendedActions: z.array(
    z.object({
      tool: z.string(),
      reason: z.string(),
      requiresConfirmation: z.boolean(),
    }),
  ),
  customerResponseDraft: z.string(),
  agntid: z.literal("UNCONFIGURED"),
});

export type InvestigationResult = z.infer<typeof investigationResultSchema>;
