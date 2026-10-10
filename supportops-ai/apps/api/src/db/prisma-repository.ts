import { randomUUID } from "node:crypto";
import type {
  CallLog,
  CreditLedgerRecord,
  Organization,
  PaymentReturnRecord,
  RefundRecord,
  SubscriptionRecord,
  SupportCase,
  User,
} from "@supportops/shared";
import {
  callLogSchema,
  creditLedgerSchema,
  organizationSchema,
  paymentReturnSchema,
  refundSchema,
  subscriptionSchema,
  supportCaseSchema,
  userSchema,
} from "@supportops/shared";
import type { PrismaClient } from "@supportops/db";
import type { CustomerSource, SupportOpsRepository } from "./repository.js";

const caseInclude = {
  organization: true,
  openedBy: true,
  assignedTo: true,
} as const;

export class PrismaSupportOpsRepository implements SupportOpsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ping(): Promise<boolean> {
    await this.prisma.$queryRaw`SELECT 1`;
    return true;
  }

  async findUserById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? userSchema.parse(user) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? userSchema.parse(user) : null;
  }

  async listAccessibleOrgIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userOrganizationAccess.findMany({
      where: { userId },
      select: { orgId: true },
    });
    return rows.map((row) => row.orgId);
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    const rows = await this.prisma.userOrganizationAccess.findMany({
      where: { userId },
      include: { organization: true },
    });
    return rows
      .map((row) => organizationSchema.parse(row.organization))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listCasesByOrgIds(orgIds: string[]): Promise<SupportCase[]> {
    if (orgIds.length === 0) return [];
    const rows = await this.prisma.supportCase.findMany({
      where: { orgId: { in: orgIds } },
      include: caseInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toCase);
  }

  async findCaseById(caseId: string): Promise<SupportCase | null> {
    const row = await this.prisma.supportCase.findUnique({
      where: { id: caseId },
      include: caseInclude,
    });
    return row ? toCase(row) : null;
  }

  async listCallsByOrgIds(orgIds: string[]): Promise<CallLog[]> {
    if (orgIds.length === 0) return [];
    const rows = await this.prisma.call.findMany({
      where: { orgId: { in: orgIds }, customerId: { not: null } },
      include: { organization: true, customer: true },
      orderBy: { startedAt: "desc" },
    });
    return rows.flatMap((row) => {
      if (!row.customer) return [];
      return [
        callLogSchema.parse({
          id: row.id,
          orgId: row.orgId,
          orgName: row.organization.name,
          customerId: row.customer.id,
          customerName: row.customer.displayName,
          status: row.status,
          failureCategory: row.failureCategory,
          durationSeconds: row.durationSeconds,
          startedAt: row.startedAt.toISOString(),
          region: row.region,
        }),
      ];
    });
  }

  async listSubscriptionsByOrgIds(orgIds: string[]): Promise<SubscriptionRecord[]> {
    if (orgIds.length === 0) return [];
    const rows = await this.prisma.subscription.findMany({
      where: { orgId: { in: orgIds } },
      include: { organization: true, customer: true },
    });
    return rows.map((row) =>
      subscriptionSchema.parse({
        id: row.id,
        orgId: row.orgId,
        orgName: row.organization.name,
        customerId: row.customerId,
        customerName: row.customer.displayName,
        planName: row.planName,
        status: row.status,
        amountCents: row.amountCents,
        currency: "USD",
        renewalAt: row.renewalAt.toISOString(),
      }),
    );
  }

  async listCustomersByOrgIds(orgIds: string[]): Promise<CustomerSource[]> {
    if (orgIds.length === 0) return [];
    const rows = await this.prisma.customer.findMany({
      where: { orgId: { in: orgIds } },
      include: { organization: true, creditAdjustments: true },
    });
    return rows.map((row) => this.toCustomer(row));
  }

  async findCustomerById(customerId: string): Promise<CustomerSource | null> {
    const row = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { organization: true, creditAdjustments: true },
    });
    return row ? this.toCustomer(row) : null;
  }

  async listRefundsByOrgIds(orgIds: string[]): Promise<RefundRecord[]> {
    if (orgIds.length === 0) return [];
    const rows = await this.prisma.refundRequest.findMany({
      where: { orgId: { in: orgIds } },
      include: { organization: true, customer: true, decidedBy: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.toRefund(row));
  }

  async findRefundById(refundId: string): Promise<RefundRecord | null> {
    const row = await this.prisma.refundRequest.findUnique({
      where: { id: refundId },
      include: { organization: true, customer: true, decidedBy: true },
    });
    return row ? this.toRefund(row) : null;
  }

  async decideRefund(input: {
    refundId: string;
    decision: "allow" | "deny";
    actorUserId: string;
    actorName: string;
  }) {
    const updated = await this.prisma.refundRequest.updateMany({
      where: { id: input.refundId, status: "PENDING" },
      data: {
        status: input.decision === "allow" ? "ALLOWED" : "DENIED",
        decidedByUserId: input.actorUserId,
        decidedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      const existing = await this.findRefundById(input.refundId);
      return existing ? { type: "conflict" as const } : { type: "missing" as const };
    }
    const refund = await this.findRefundById(input.refundId);
    if (!refund) return { type: "missing" as const };
    return { type: "ok" as const, refund };
  }

  async listCreditsByOrgIds(orgIds: string[]): Promise<CreditLedgerRecord[]> {
    if (orgIds.length === 0) return [];
    const rows = await this.prisma.creditAdjustment.findMany({
      where: { orgId: { in: orgIds } },
      include: { customer: true, actor: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) =>
      creditLedgerSchema.parse({
        id: row.id,
        orgId: row.orgId,
        customerId: row.customerId,
        customerName: row.customer.displayName,
        amountCents: row.amountCents,
        reason: row.reason,
        actorName: row.actor.displayName,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  async creditBalance(customerId: string): Promise<number> {
    const rows = await this.prisma.creditAdjustment.findMany({
      where: { customerId },
      select: { amountCents: true },
    });
    return rows.reduce((sum, row) => sum + row.amountCents, 0);
  }

  async adjustCredit(input: { customerId: string; amountCents: number; reason: string; actorUserId: string }) {
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) return { type: "missing" as const };
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.creditAdjustment.findMany({
        where: { customerId: input.customerId },
        select: { amountCents: true },
      });
      const balance = rows.reduce((sum, row) => sum + row.amountCents, 0);
      if (balance + input.amountCents < 0) return { type: "insufficient" as const };
      const created = await tx.creditAdjustment.create({
        data: {
          id: `credit_${randomUUID()}`,
          orgId: customer.orgId,
          customerId: input.customerId,
          amountCents: input.amountCents,
          reason: input.reason,
          actorUserId: input.actorUserId,
        },
        include: { customer: true, actor: true },
      });
      return {
        type: "ok" as const,
        entry: creditLedgerSchema.parse({
          id: created.id,
          orgId: created.orgId,
          customerId: created.customerId,
          customerName: created.customer.displayName,
          amountCents: created.amountCents,
          reason: created.reason,
          actorName: created.actor.displayName,
          createdAt: created.createdAt.toISOString(),
        }),
      };
    });
  }

  async listPaymentReturnsByOrgIds(orgIds: string[]): Promise<PaymentReturnRecord[]> {
    if (orgIds.length === 0) return [];
    const rows = await this.prisma.paymentReturn.findMany({
      where: { orgId: { in: orgIds } },
      include: { customer: true, submittedBy: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.toReturn(row));
  }

  async returnPayment(input: { refundId: string; actorUserId: string; actorName: string }) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: input.refundId } });
    if (!refund) return { type: "missing" as const };
    if (refund.status !== "ALLOWED") return { type: "not_allowed" as const };
    const existing = await this.prisma.paymentReturn.findUnique({
      where: { refundRequestId: refund.id },
      include: { customer: true, submittedBy: true },
    });
    if (existing) return { type: "ok" as const, payment: this.toReturn(existing), replayed: true };
    const created = await this.prisma.paymentReturn.create({
      data: {
        id: `return_${randomUUID()}`,
        orgId: refund.orgId,
        refundRequestId: refund.id,
        customerId: refund.customerId,
        amountCents: refund.amountCents,
        currency: "USD",
        provider: "mock_card",
        providerReference: `mock_re_${refund.id}`,
        status: "SUBMITTED",
        submittedByUserId: input.actorUserId,
      },
      include: { customer: true, submittedBy: true },
    });
    return { type: "ok" as const, payment: this.toReturn(created), replayed: false };
  }

  private toCustomer(row: {
    id: string;
    orgId: string;
    displayName: string;
    email: string;
    plan: "PAYG" | "ENTERPRISE";
    region: string;
    status: string;
    paymentBrand: string;
    paymentLast4: string;
    organization: { name: string };
    creditAdjustments: Array<{ amountCents: number }>;
  }): CustomerSource {
    return {
      id: row.id,
      orgId: row.orgId,
      orgName: row.organization.name,
      displayName: row.displayName,
      plan: row.plan,
      region: row.region,
      status: row.status,
      email: row.email,
      paymentBrand: row.paymentBrand,
      paymentLast4: row.paymentLast4,
      creditBalanceCents: row.creditAdjustments.reduce((sum, entry) => sum + entry.amountCents, 0),
    };
  }

  private toRefund(row: {
    id: string;
    orgId: string;
    customerId: string;
    supportCaseId: string | null;
    amountCents: number;
    reason: string;
    status: RefundRecord["status"];
    createdAt: Date;
    organization: { name: string };
    customer: { displayName: string };
    decidedBy: { displayName: string } | null;
  }): RefundRecord {
    return refundSchema.parse({
      id: row.id,
      orgId: row.orgId,
      orgName: row.organization.name,
      customerId: row.customerId,
      customerName: row.customer.displayName,
      supportCaseId: row.supportCaseId,
      amountCents: row.amountCents,
      currency: "USD",
      reason: row.reason,
      status: row.status,
      decidedBy: row.decidedBy?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }

  private toReturn(row: {
    id: string;
    orgId: string;
    refundRequestId: string;
    customerId: string;
    amountCents: number;
    provider: string;
    providerReference: string;
    status: PaymentReturnRecord["status"];
    createdAt: Date;
    customer: { displayName: string };
    submittedBy: { displayName: string };
  }): PaymentReturnRecord {
    return paymentReturnSchema.parse({
      id: row.id,
      orgId: row.orgId,
      refundRequestId: row.refundRequestId,
      customerId: row.customerId,
      customerName: row.customer.displayName,
      amountCents: row.amountCents,
      currency: "USD",
      provider: row.provider,
      providerReference: row.providerReference,
      status: row.status,
      submittedBy: row.submittedBy.displayName,
      createdAt: row.createdAt.toISOString(),
    });
  }
}

function toCase(row: {
  id: string;
  orgId: string;
  title: string;
  description: string;
  status: SupportCase["status"];
  priority: SupportCase["priority"];
  createdAt: Date;
  updatedAt: Date;
  organization: { name: string };
  openedBy: { id: string; displayName: string };
  assignedTo: { id: string; displayName: string } | null;
}): SupportCase {
  return supportCaseSchema.parse({
    id: row.id,
    orgId: row.orgId,
    orgName: row.organization.name,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    openedBy: { id: row.openedBy.id, displayName: row.openedBy.displayName },
    assignedTo: row.assignedTo ? { id: row.assignedTo.id, displayName: row.assignedTo.displayName } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
