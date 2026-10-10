import { z } from "zod";

export const userRoleSchema = z.enum([
  "CSE_PAYG",
  "CSE_ENTERPRISE",
  "CSE_PAYG_SENIOR",
  "CSE_ENTERPRISE_SENIOR",
]);
export const orgStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
export const orgAccessRoleSchema = z.enum(["MEMBER", "LEAD"]);
export const caseStatusSchema = z.enum([
  "OPEN",
  "INVESTIGATING",
  "PENDING_APPROVAL",
  "RESOLVED",
  "ESCALATED",
]);
export const casePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const integrationStatusSchema = z.enum(["CONNECTED", "UNCONFIGURED", "ERROR"]);

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: userRoleSchema,
});

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.string(),
  region: z.string(),
  status: orgStatusSchema,
});

export const supportCaseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  orgName: z.string(),
  title: z.string(),
  description: z.string(),
  status: caseStatusSchema,
  priority: casePrioritySchema,
  openedBy: z.object({ id: z.string(), displayName: z.string() }),
  assignedTo: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string(),
  }),
});

export const demoLoginBodySchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export const supportSegmentSchema = z.enum(["payg", "enterprise", "all"]);

export const accessProfileSchema = z.object({
  segment: supportSegmentSchema,
  actions: z.array(z.string()),
  tools: z.array(z.string()),
});

export const accessTokenSchema = z.object({
  accessToken: z.string(),
  claims: z.object({
    sub: z.string(),
    role: userRoleSchema,
    iss: z.string(),
    exp: z.number(),
  }),
});

export const meResponseSchema = z.object({
  user: userSchema,
  organizations: z.array(organizationSchema),
  access: accessProfileSchema,
  token: accessTokenSchema,
});

export const organizationListSchema = z.object({
  organizations: z.array(organizationSchema),
});

export const caseListSchema = z.object({
  cases: z.array(supportCaseSchema),
});

export const caseResponseSchema = z.object({
  case: supportCaseSchema,
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("supportops-api"),
  demoMode: z.boolean(),
  database: z.enum(["ok", "unavailable"]),
  agntid: integrationStatusSchema,
});

export const demoScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  orgId: z.string(),
  caseId: z.string().nullable(),
  runnable: z.boolean(),
  milestone: z.string(),
});

export const demoScenarioListSchema = z.object({
  scenarios: z.array(demoScenarioSchema),
  agntid: integrationStatusSchema,
});

export const customerPlanSchema = z.enum(["PAYG", "ENTERPRISE"]);
export const callStatusSchema = z.enum(["COMPLETED", "FAILED", "IN_PROGRESS"]);
export const refundStatusSchema = z.enum(["PENDING", "ALLOWED", "DENIED"]);
export const paymentReturnStatusSchema = z.enum(["SUBMITTED", "FAILED"]);

export const callLogSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  orgName: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  status: callStatusSchema,
  failureCategory: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  startedAt: z.string().datetime(),
  region: z.string(),
});

export const subscriptionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  orgName: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  planName: z.string(),
  status: z.enum(["ACTIVE", "PAST_DUE", "CANCELED"]),
  amountCents: z.number().int(),
  currency: z.literal("USD"),
  renewalAt: z.string().datetime(),
});

export const customerSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  orgName: z.string(),
  displayName: z.string(),
  plan: customerPlanSchema,
  region: z.string(),
  status: z.string(),
  email: z.string().nullable(),
  paymentBrand: z.string().nullable(),
  paymentLast4: z.string().nullable(),
  creditBalanceCents: z.number().int(),
});

export const refundSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  orgName: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  supportCaseId: z.string().nullable(),
  amountCents: z.number().int(),
  currency: z.literal("USD"),
  reason: z.string(),
  status: refundStatusSchema,
  decidedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const creditLedgerSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  amountCents: z.number().int(),
  reason: z.string(),
  actorName: z.string(),
  createdAt: z.string().datetime(),
});

export const paymentReturnSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  refundRequestId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  amountCents: z.number().int(),
  currency: z.literal("USD"),
  provider: z.string(),
  providerReference: z.string(),
  status: paymentReturnStatusSchema,
  submittedBy: z.string(),
  createdAt: z.string().datetime(),
});

export const toolCheckBodySchema = z
  .object({
    tool: z.string(),
  })
  .strict();

export const toolCheckResponseSchema = z
  .object({
    tool: z.string(),
    allowed: z.boolean(),
    executed: z.literal(false),
    enforcedBy: z.literal("api_role_gate"),
    agntid: z.literal("UNCONFIGURED"),
    reason: z.string(),
  })
  .strict();

export const refundDecisionBodySchema = z
  .object({
    decision: z.enum(["allow", "deny"]),
  })
  .strict();

export const creditAdjustBodySchema = z
  .object({
    customerId: z.string(),
    amountCents: z.number().int().positive(),
    direction: z.enum(["give", "reduce"]),
    reason: z.string().min(3).max(280),
  })
  .strict();

export type UserRole = z.infer<typeof userRoleSchema>;
export type OrgStatus = z.infer<typeof orgStatusSchema>;
export type OrgAccessRole = z.infer<typeof orgAccessRoleSchema>;
export type CaseStatus = z.infer<typeof caseStatusSchema>;
export type CasePriority = z.infer<typeof casePrioritySchema>;
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;
export type User = z.infer<typeof userSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type SupportCase = z.infer<typeof supportCaseSchema>;
export type DemoScenario = z.infer<typeof demoScenarioSchema>;
export type CallLog = z.infer<typeof callLogSchema>;
export type SubscriptionRecord = z.infer<typeof subscriptionSchema>;
export type CustomerRecord = z.infer<typeof customerSchema>;
export type RefundRecord = z.infer<typeof refundSchema>;
export type CreditLedgerRecord = z.infer<typeof creditLedgerSchema>;
export type PaymentReturnRecord = z.infer<typeof paymentReturnSchema>;
