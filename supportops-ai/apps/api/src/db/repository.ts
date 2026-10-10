import type {
  CallLog,
  CreditLedgerRecord,
  CustomerRecord,
  Organization,
  PaymentReturnRecord,
  RefundRecord,
  SubscriptionRecord,
  SupportCase,
  User,
} from "@supportops/shared";

export type CustomerSource = CustomerRecord & {
  email: string;
  paymentBrand: string;
  paymentLast4: string;
};

export interface SupportOpsRepository {
  ping(): Promise<boolean>;
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  listAccessibleOrgIds(userId: string): Promise<string[]>;
  listOrganizations(userId: string): Promise<Organization[]>;
  listCasesByOrgIds(orgIds: string[]): Promise<SupportCase[]>;
  findCaseById(caseId: string): Promise<SupportCase | null>;
  listCallsByOrgIds(orgIds: string[]): Promise<CallLog[]>;
  listSubscriptionsByOrgIds(orgIds: string[]): Promise<SubscriptionRecord[]>;
  listCustomersByOrgIds(orgIds: string[]): Promise<CustomerSource[]>;
  findCustomerById(customerId: string): Promise<CustomerSource | null>;
  listRefundsByOrgIds(orgIds: string[]): Promise<RefundRecord[]>;
  findRefundById(refundId: string): Promise<RefundRecord | null>;
  decideRefund(input: {
    refundId: string;
    decision: "allow" | "deny";
    actorUserId: string;
    actorName: string;
  }): Promise<{ type: "ok"; refund: RefundRecord } | { type: "conflict" } | { type: "missing" }>;
  listCreditsByOrgIds(orgIds: string[]): Promise<CreditLedgerRecord[]>;
  creditBalance(customerId: string): Promise<number>;
  adjustCredit(input: {
    customerId: string;
    amountCents: number;
    reason: string;
    actorUserId: string;
  }): Promise<{ type: "ok"; entry: CreditLedgerRecord } | { type: "missing" } | { type: "insufficient" }>;
  listPaymentReturnsByOrgIds(orgIds: string[]): Promise<PaymentReturnRecord[]>;
  returnPayment(input: {
    refundId: string;
    actorUserId: string;
    actorName: string;
  }): Promise<
    | { type: "ok"; payment: PaymentReturnRecord; replayed: boolean }
    | { type: "missing" }
    | { type: "not_allowed" }
  >;
}
