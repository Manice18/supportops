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
  seedAccess,
  flagshipCalls,
  seedCalls,
  seedCases,
  seedCreditAdjustments,
  seedCustomers,
  seedOrganizations,
  seedPaymentReturns,
  seedRefunds,
  seedSubscriptions,
  seedUsers,
  type SeedAccess,
  type SeedCall,
  type SeedCreditAdjustment,
  type SeedCustomer,
  type SeedOrganization,
  type SeedPaymentReturn,
  type SeedRefund,
  type SeedSubscription,
  type SeedSupportCase,
  type SeedUser,
} from "@supportops/mock-data";
import type { CustomerSource, SupportOpsRepository } from "./repository.js";

export type MemorySeed = {
  users: SeedUser[];
  organizations: SeedOrganization[];
  access: SeedAccess[];
  cases: SeedSupportCase[];
  customers: SeedCustomer[];
  subscriptions: SeedSubscription[];
  calls: SeedCall[];
  refunds: SeedRefund[];
  credits: SeedCreditAdjustment[];
  paymentReturns: SeedPaymentReturn[];
};

const defaultSeed: MemorySeed = {
  users: seedUsers,
  organizations: seedOrganizations,
  access: seedAccess,
  cases: seedCases,
  customers: seedCustomers,
  subscriptions: seedSubscriptions,
  calls: [...seedCalls, ...flagshipCalls],
  refunds: seedRefunds,
  credits: seedCreditAdjustments,
  paymentReturns: seedPaymentReturns,
};

export type MemorySeedInput = Omit<
  MemorySeed,
  "customers" | "subscriptions" | "calls" | "refunds" | "credits" | "paymentReturns"
> &
  Partial<Pick<MemorySeed, "customers" | "subscriptions" | "calls" | "refunds" | "credits" | "paymentReturns">>;

export class InMemorySupportOpsRepository implements SupportOpsRepository {
  private readonly data: MemorySeed;

  constructor(seed: MemorySeedInput = defaultSeed) {
    this.data = structuredClone({
      customers: [],
      subscriptions: [],
      calls: [],
      refunds: [],
      credits: [],
      paymentReturns: [],
      ...seed,
    });
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async findUserById(id: string): Promise<User | null> {
    const user = this.data.users.find((candidate) => candidate.id === id);
    return user ? toUser(user) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const user = this.data.users.find((candidate) => candidate.email === email);
    return user ? toUser(user) : null;
  }

  async listAccessibleOrgIds(userId: string): Promise<string[]> {
    return this.data.access.filter((row) => row.userId === userId).map((row) => row.orgId);
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    const orgIds = new Set(await this.listAccessibleOrgIds(userId));
    return this.data.organizations
      .filter((org) => orgIds.has(org.id))
      .map(toOrganization)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listCasesByOrgIds(orgIds: string[]): Promise<SupportCase[]> {
    const allowed = new Set(orgIds);
    return this.data.cases
      .filter((row) => allowed.has(row.orgId))
      .map((row) => this.toCase(row))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findCaseById(caseId: string): Promise<SupportCase | null> {
    const row = this.data.cases.find((candidate) => candidate.id === caseId);
    return row ? this.toCase(row) : null;
  }

  async listCallsByOrgIds(orgIds: string[]): Promise<CallLog[]> {
    const allowed = new Set(orgIds);
    return this.data.calls
      .filter((row) => allowed.has(row.orgId))
      .map((row) => this.toCall(row))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async listSubscriptionsByOrgIds(orgIds: string[]): Promise<SubscriptionRecord[]> {
    const allowed = new Set(orgIds);
    return this.data.subscriptions
      .filter((row) => allowed.has(row.orgId))
      .map((row) => this.toSubscription(row));
  }

  async listCustomersByOrgIds(orgIds: string[]): Promise<CustomerSource[]> {
    const allowed = new Set(orgIds);
    return this.data.customers.filter((row) => allowed.has(row.orgId)).map((row) => this.toCustomer(row));
  }

  async findCustomerById(customerId: string): Promise<CustomerSource | null> {
    const row = this.data.customers.find((candidate) => candidate.id === customerId);
    return row ? this.toCustomer(row) : null;
  }

  async listRefundsByOrgIds(orgIds: string[]): Promise<RefundRecord[]> {
    const allowed = new Set(orgIds);
    return this.data.refunds
      .filter((row) => allowed.has(row.orgId))
      .map((row) => this.toRefund(row))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findRefundById(refundId: string): Promise<RefundRecord | null> {
    const row = this.data.refunds.find((candidate) => candidate.id === refundId);
    return row ? this.toRefund(row) : null;
  }

  async decideRefund(input: {
    refundId: string;
    decision: "allow" | "deny";
    actorUserId: string;
    actorName: string;
  }) {
    const row = this.data.refunds.find((candidate) => candidate.id === input.refundId);
    if (!row) return { type: "missing" as const };
    if (row.status !== "PENDING") return { type: "conflict" as const };
    row.status = input.decision === "allow" ? "ALLOWED" : "DENIED";
    row.decidedByUserId = input.actorUserId;
    row.decidedAt = new Date().toISOString();
    return { type: "ok" as const, refund: this.toRefund(row) };
  }

  async listCreditsByOrgIds(orgIds: string[]): Promise<CreditLedgerRecord[]> {
    const allowed = new Set(orgIds);
    return this.data.credits
      .filter((row) => allowed.has(row.orgId))
      .map((row) => this.toCredit(row))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async creditBalance(customerId: string): Promise<number> {
    return this.data.credits
      .filter((row) => row.customerId === customerId)
      .reduce((sum, row) => sum + row.amountCents, 0);
  }

  async adjustCredit(input: { customerId: string; amountCents: number; reason: string; actorUserId: string }) {
    const customer = this.data.customers.find((candidate) => candidate.id === input.customerId);
    if (!customer) return { type: "missing" as const };
    const balance = await this.creditBalance(input.customerId);
    if (balance + input.amountCents < 0) return { type: "insufficient" as const };
    const row: SeedCreditAdjustment = {
      id: `credit_${input.customerId}_${this.data.credits.length + 1}`,
      orgId: customer.orgId,
      customerId: input.customerId,
      amountCents: input.amountCents,
      reason: input.reason,
      actorUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.data.credits.push(row);
    return { type: "ok" as const, entry: this.toCredit(row) };
  }

  async listPaymentReturnsByOrgIds(orgIds: string[]): Promise<PaymentReturnRecord[]> {
    const allowed = new Set(orgIds);
    return this.data.paymentReturns.filter((row) => allowed.has(row.orgId)).map((row) => this.toReturn(row));
  }

  async returnPayment(input: { refundId: string; actorUserId: string; actorName: string }) {
    const refund = this.data.refunds.find((candidate) => candidate.id === input.refundId);
    if (!refund) return { type: "missing" as const };
    if (refund.status !== "ALLOWED") return { type: "not_allowed" as const };
    const existing = this.data.paymentReturns.find((candidate) => candidate.refundRequestId === refund.id);
    if (existing) return { type: "ok" as const, payment: this.toReturn(existing), replayed: true };
    const row: SeedPaymentReturn = {
      id: `return_${refund.id}`,
      orgId: refund.orgId,
      refundRequestId: refund.id,
      customerId: refund.customerId,
      amountCents: refund.amountCents,
      currency: "USD",
      provider: "mock_card",
      providerReference: `mock_re_${refund.id}`,
      status: "SUBMITTED",
      submittedByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.data.paymentReturns.push(row);
    return { type: "ok" as const, payment: this.toReturn(row), replayed: false };
  }

  private toCase(row: SeedSupportCase): SupportCase {
    const organization = this.data.organizations.find((candidate) => candidate.id === row.orgId);
    const openedBy = this.data.users.find((candidate) => candidate.id === row.openedByUserId);
    const assignedTo = row.assignedToUserId
      ? this.data.users.find((candidate) => candidate.id === row.assignedToUserId)
      : undefined;
    if (!organization || !openedBy) {
      throw new Error(`Fixture ${row.id} is missing its organization or opener.`);
    }
    return {
      id: row.id,
      orgId: row.orgId,
      orgName: organization.name,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      openedBy: { id: openedBy.id, displayName: openedBy.displayName },
      assignedTo: assignedTo ? { id: assignedTo.id, displayName: assignedTo.displayName } : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private orgName(orgId: string): string {
    return this.data.organizations.find((org) => org.id === orgId)?.name ?? orgId;
  }

  private customerName(customerId: string): string {
    return this.data.customers.find((customer) => customer.id === customerId)?.displayName ?? customerId;
  }

  private userName(userId: string | null): string | null {
    if (!userId) return null;
    return this.data.users.find((user) => user.id === userId)?.displayName ?? userId;
  }

  private toCall(row: SeedCall): CallLog {
    return {
      id: row.id,
      orgId: row.orgId,
      orgName: this.orgName(row.orgId),
      customerId: row.customerId,
      customerName: this.customerName(row.customerId),
      status: row.status,
      failureCategory: row.failureCategory,
      durationSeconds: row.durationSeconds,
      startedAt: row.startedAt,
      region: row.region,
    };
  }

  private toSubscription(row: SeedSubscription): SubscriptionRecord {
    return {
      id: row.id,
      orgId: row.orgId,
      orgName: this.orgName(row.orgId),
      customerId: row.customerId,
      customerName: this.customerName(row.customerId),
      planName: row.planName,
      status: row.status,
      amountCents: row.amountCents,
      currency: "USD",
      renewalAt: row.renewalAt,
    };
  }

  private toCustomer(row: SeedCustomer): CustomerSource {
    return {
      id: row.id,
      orgId: row.orgId,
      orgName: this.orgName(row.orgId),
      displayName: row.displayName,
      plan: row.plan,
      region: row.region,
      status: row.status,
      email: row.email,
      paymentBrand: row.paymentBrand,
      paymentLast4: row.paymentLast4,
      creditBalanceCents: this.data.credits
        .filter((entry) => entry.customerId === row.id)
        .reduce((sum, entry) => sum + entry.amountCents, 0),
    };
  }

  private toRefund(row: SeedRefund): RefundRecord {
    return {
      id: row.id,
      orgId: row.orgId,
      orgName: this.orgName(row.orgId),
      customerId: row.customerId,
      customerName: this.customerName(row.customerId),
      supportCaseId: row.supportCaseId,
      amountCents: row.amountCents,
      currency: "USD",
      reason: row.reason,
      status: row.status,
      decidedBy: this.userName(row.decidedByUserId),
      createdAt: row.createdAt,
    };
  }

  private toCredit(row: SeedCreditAdjustment): CreditLedgerRecord {
    return {
      id: row.id,
      orgId: row.orgId,
      customerId: row.customerId,
      customerName: this.customerName(row.customerId),
      amountCents: row.amountCents,
      reason: row.reason,
      actorName: this.userName(row.actorUserId) ?? row.actorUserId,
      createdAt: row.createdAt,
    };
  }

  private toReturn(row: SeedPaymentReturn): PaymentReturnRecord {
    return {
      id: row.id,
      orgId: row.orgId,
      refundRequestId: row.refundRequestId,
      customerId: row.customerId,
      customerName: this.customerName(row.customerId),
      amountCents: row.amountCents,
      currency: "USD",
      provider: row.provider,
      providerReference: row.providerReference,
      status: row.status,
      submittedBy: this.userName(row.submittedByUserId) ?? row.submittedByUserId,
      createdAt: row.createdAt,
    };
  }
}

function toUser(user: SeedUser): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

function toOrganization(org: SeedOrganization): Organization {
  return {
    id: org.id,
    name: org.name,
    plan: org.plan,
    region: org.region,
    status: org.status,
  };
}
