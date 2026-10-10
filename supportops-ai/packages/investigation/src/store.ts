import { randomUUID } from "node:crypto";
import { flagshipDataset } from "@supportops/mock-data";
import {
  CREDIT_CAP_CENTS,
  FLAGSHIP_WINDOW,
  isEligibleFailure,
  type AxiomLogRecord,
  type BillingEntryRecord,
  type ClickHouseEventRecord,
  type FeatureFlagSnapshotRecord,
  type MetricSampleRecord,
  type Page,
  type TraceSpanRecord,
} from "@supportops/shared";

type CallRow = (typeof flagshipDataset.calls)[number];
type BillingRow = (typeof flagshipDataset.billing)[number];

export type EvidenceCall = {
  id: string;
  failureCategory: string | null;
  requestId: string;
  traceId: string;
  startedAt: string;
  amountCents: number;
  billingStatus: string;
  eligible: boolean;
};

export type EvidenceReport = {
  window: typeof FLAGSHIP_WINDOW;
  failedCallCount: number;
  eligibleAmountCents: number;
  safeAmountCents: number;
  capCents: number;
  calls: EvidenceCall[];
  logs: AxiomLogRecord[];
  events: ClickHouseEventRecord[];
  flags: FeatureFlagSnapshotRecord[];
  metrics: MetricSampleRecord[];
};

export type StoredCredit = {
  id: string;
  orgId: string;
  supportCaseId: string;
  amountCents: number;
  currency: "USD";
  reason: string;
  kind: "safe" | "eligible";
  state: "PROPOSED" | "APPLIED" | "REJECTED";
  idempotencyKey: string;
  createdAt: string;
  appliedAt: string | null;
};

export type StoredApproval = {
  id: string;
  orgId: string;
  supportCaseId: string;
  amountCents: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedByUserId: string;
  reviewedByUserId: string | null;
};

export type StoredAttempt = {
  id: string;
  investigationId: string | null;
  supportCaseId: string;
  actorUserId: string;
  orgId: string;
  toolName: string;
  sanitizedArguments: Record<string, unknown>;
  authorizationStatus: "UNAVAILABLE" | "ALLOWED" | "DENIED" | "MALFORMED";
  executed: boolean;
  executionStatus: "NOT_EXECUTED" | "SUCCEEDED" | "FAILED";
  reasonCode: string;
  createdAt: string;
};

export type StoredInvestigation = {
  id: string;
  supportCaseId: string;
  userId: string;
  status: string;
  findings: unknown;
  startedAt: string;
  finishedAt: string | null;
};

export type StoredAudit = {
  id: string;
  actorUserId: string;
  orgId: string;
  supportCaseId: string;
  action: string;
  outcome: string;
  sanitizedPayload: Record<string, unknown>;
  timestamp: string;
};

export interface InvestigationStore {
  evidence(orgId: string, includeMetrics: boolean, includeFlags: boolean): Promise<EvidenceReport>;
  searchLogs(query: {
    orgId: string;
    start: string;
    end: string;
    severity?: string;
    limit: number;
  }): Promise<Page<AxiomLogRecord>>;
  getCallEvents(query: {
    orgId: string;
    start: string;
    end: string;
    callIds?: string[];
    limit: number;
  }): Promise<Page<ClickHouseEventRecord>>;
  getTrace(orgId: string, traceId: string): Promise<TraceSpanRecord[]>;
  getMetrics(query: {
    region: string;
    service: string;
    metricName: string;
    start: string;
    end: string;
  }): Promise<MetricSampleRecord[]>;
  getFlags(orgId: string): Promise<FeatureFlagSnapshotRecord[]>;
  flagRevision(orgId: string, flagKey: string): Promise<number | null>;
  setFeatureFlag(orgId: string, flagKey: string, enabled: boolean): Promise<FeatureFlagSnapshotRecord>;
  getBilling(orgId: string, callIds: string[]): Promise<BillingEntryRecord[]>;
  proposeCredit(input: {
    orgId: string;
    caseId: string;
    kind: "safe" | "eligible";
    actorUserId: string;
  }): Promise<{ credit: StoredCredit; replayed: boolean } | { type: "empty" }>;
  applyCredit(input: {
    orgId: string;
    caseId: string;
    idempotencyKey: string;
    actorUserId: string;
  }): Promise<
    | { type: "ok"; credit: StoredCredit; replayed: boolean }
    | { type: "missing" }
    | { type: "cap" }
    | { type: "shortfall" }
  >;
  escalate(input: {
    orgId: string;
    caseId: string;
    amountCents: number;
    reason: string;
    actorUserId: string;
  }): Promise<StoredApproval>;
  reviewApproval(input: {
    orgId: string;
    caseId: string;
    approvalId: string;
    decision: "approve" | "reject";
    actorUserId: string;
  }): Promise<StoredApproval | null>;
  listCredits(caseId: string): Promise<StoredCredit[]>;
  saveInvestigation(input: {
    supportCaseId: string;
    userId: string;
    findings: unknown;
    attempts: Array<Omit<StoredAttempt, "id" | "investigationId" | "createdAt">>;
  }): Promise<StoredInvestigation>;
  listInvestigations(caseId: string): Promise<StoredInvestigation[]>;
  getInvestigation(id: string): Promise<{ investigation: StoredInvestigation; attempts: StoredAttempt[] } | null>;
  listAttempts(caseId: string): Promise<StoredAttempt[]>;
  listAudit(caseId: string): Promise<StoredAudit[]>;
  recordAudit(input: Omit<StoredAudit, "id" | "timestamp">): Promise<void>;
}

function page<T>(items: T[], limit: number): Page<T> {
  const capped = Math.min(Math.max(limit, 1), 100);
  return { items: items.slice(0, capped), nextCursor: items.length > capped ? String(capped) : null };
}

function inWindow(timestamp: string, start: string, end: string) {
  return timestamp >= start && timestamp < end;
}

export class MemoryInvestigationStore implements InvestigationStore {
  private calls: CallRow[];
  private logs: AxiomLogRecord[];
  private events: ClickHouseEventRecord[];
  private spans: TraceSpanRecord[];
  private metrics: MetricSampleRecord[];
  private flags: FeatureFlagSnapshotRecord[];
  private billing: BillingRow[];
  private credits: StoredCredit[] = [];
  private approvals: StoredApproval[] = [];
  private investigations: StoredInvestigation[] = [];
  private attempts: StoredAttempt[] = [];
  private audits: StoredAudit[] = [];

  constructor() {
    const data = structuredClone(flagshipDataset);
    this.calls = data.calls;
    this.logs = data.logs.map((log) => ({ ...log, safeMetadata: log.safeMetadata }));
    this.events = data.events.map((event) => ({
      ...event,
      safeRequestMetadata: event.safeRequestMetadata,
      safeResponseMetadata: event.safeResponseMetadata,
    }));
    this.spans = data.spans.map((span) => ({ ...span, attributes: span.attributes }));
    this.metrics = data.metrics.map((metric) => ({ ...metric, tags: metric.tags }));
    this.flags = data.flags;
    this.billing = data.billing;
  }

  async evidence(orgId: string, includeMetrics: boolean, includeFlags: boolean): Promise<EvidenceReport> {
    const calls = this.incidentCalls(orgId);
    const metrics = includeMetrics
      ? this.metrics.filter(
          (metric) =>
            metric.region === "us-east-1" &&
            metric.metricName === "request_error_ratio" &&
            inWindow(metric.timestamp, FLAGSHIP_WINDOW.start, FLAGSHIP_WINDOW.end),
        )
      : [];
    return {
      window: FLAGSHIP_WINDOW,
      failedCallCount: calls.length,
      eligibleAmountCents: this.sum(orgId, "eligible"),
      safeAmountCents: this.sum(orgId, "safe"),
      capCents: CREDIT_CAP_CENTS,
      calls,
      logs: this.logs.filter(
        (log) => log.orgId === orgId && inWindow(log.timestamp, FLAGSHIP_WINDOW.start, FLAGSHIP_WINDOW.end),
      ),
      events: this.events.filter(
        (event) => event.orgId === orgId && inWindow(event.timestamp, FLAGSHIP_WINDOW.start, FLAGSHIP_WINDOW.end),
      ),
      flags: includeFlags ? this.flags.filter((flag) => flag.orgId === orgId) : [],
      metrics,
    };
  }

  async searchLogs(query: { orgId: string; start: string; end: string; severity?: string; limit: number }) {
    const items = this.logs
      .filter(
        (log) =>
          log.orgId === query.orgId &&
          inWindow(log.timestamp, query.start, query.end) &&
          (!query.severity || log.severity === query.severity),
      )
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    return page(items, query.limit);
  }

  async getCallEvents(query: { orgId: string; start: string; end: string; callIds?: string[]; limit: number }) {
    const ids = query.callIds ? new Set(query.callIds) : null;
    const items = this.events.filter(
      (event) =>
        event.orgId === query.orgId &&
        inWindow(event.timestamp, query.start, query.end) &&
        (!ids || (event.callId !== null && ids.has(event.callId))),
    );
    return page(items, query.limit);
  }

  async getTrace(orgId: string, traceId: string) {
    return this.spans.filter((span) => span.orgId === orgId && span.traceId === traceId);
  }

  async getMetrics(query: { region: string; service: string; metricName: string; start: string; end: string }) {
    return this.metrics.filter(
      (metric) =>
        metric.region === query.region &&
        metric.service === query.service &&
        metric.metricName === query.metricName &&
        inWindow(metric.timestamp, query.start, query.end),
    );
  }

  async getFlags(orgId: string) {
    return this.flags.filter((flag) => flag.orgId === orgId);
  }

  async getBilling(orgId: string, callIds: string[]) {
    const ids = new Set(callIds);
    return this.billing.filter((entry) => entry.orgId === orgId && entry.callId !== null && ids.has(entry.callId)).map(toBilling);
  }

  async flagRevision(orgId: string, flagKey: string) {
    return this.flags.find((flag) => flag.orgId === orgId && flag.flagKey === flagKey)?.revision ?? null;
  }

  async setFeatureFlag(orgId: string, flagKey: string, enabled: boolean) {
    const existing = this.flags.find((flag) => flag.orgId === orgId && flag.flagKey === flagKey);
    if (existing) {
      existing.enabled = enabled;
      existing.revision += 1;
      existing.observedAt = new Date().toISOString();
      return existing;
    }
    const created: FeatureFlagSnapshotRecord = {
      id: `flag_${orgId}_${flagKey}`,
      orgId,
      flagKey,
      enabled,
      revision: 1,
      observedAt: new Date().toISOString(),
    };
    this.flags.push(created);
    return created;
  }

  async proposeCredit(input: { orgId: string; caseId: string; kind: "safe" | "eligible"; actorUserId: string }) {
    const amountCents = this.sum(input.orgId, input.kind);
    if (amountCents <= 0) return { type: "empty" as const };
    const idempotencyKey = `propose:${input.caseId}:${input.kind}`;
    const existing = this.credits.find((credit) => credit.idempotencyKey === idempotencyKey);
    if (existing) return { credit: existing, replayed: true };
    const credit: StoredCredit = {
      id: `credit_${randomUUID()}`,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      amountCents,
      currency: "USD",
      reason:
        input.kind === "safe"
          ? "safe: Telephony-provider charges under the backend cap."
          : "eligible: All platform-failure charges.",
      kind: input.kind,
      state: "PROPOSED",
      idempotencyKey,
      createdAt: new Date().toISOString(),
      appliedAt: null,
    };
    this.credits.push(credit);
    await this.recordAudit({
      actorUserId: input.actorUserId,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      action: "propose_credit",
      outcome: "proposed",
      sanitizedPayload: { amountCents, kind: input.kind, agntid: "UNCONFIGURED" },
    });
    return { credit, replayed: false };
  }

  async applyCredit(input: { orgId: string; caseId: string; idempotencyKey: string; actorUserId: string }) {
    const credit = this.credits.find(
      (candidate) => candidate.idempotencyKey === input.idempotencyKey && candidate.supportCaseId === input.caseId,
    );
    if (!credit || credit.orgId !== input.orgId) return { type: "missing" as const };
    if (credit.state === "APPLIED") return { type: "ok" as const, credit, replayed: true };
    if (credit.amountCents > CREDIT_CAP_CENTS && !this.hasApproval(input.caseId, credit.amountCents)) {
      return { type: "cap" as const };
    }
    const entries = this.entriesFor(input.orgId, credit.kind).filter((entry) => entry.status === "POSTED");
    const available = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (available !== credit.amountCents) return { type: "shortfall" as const };
    for (const entry of entries) entry.status = "CREDITED";
    credit.state = "APPLIED";
    credit.appliedAt = new Date().toISOString();
    await this.recordAudit({
      actorUserId: input.actorUserId,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      action: "apply_credit",
      outcome: "applied",
      sanitizedPayload: { amountCents: credit.amountCents, agntid: "UNCONFIGURED", backend: "ALLOWED" },
    });
    return { type: "ok" as const, credit, replayed: false };
  }

  async escalate(input: {
    orgId: string;
    caseId: string;
    amountCents: number;
    reason: string;
    actorUserId: string;
  }) {
    const existing = this.approvals.find(
      (approval) =>
        approval.supportCaseId === input.caseId &&
        approval.amountCents === input.amountCents &&
        approval.status === "PENDING",
    );
    if (existing) return existing;
    const approval: StoredApproval = {
      id: `approval_${randomUUID()}`,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      amountCents: input.amountCents,
      reason: input.reason,
      status: "PENDING",
      requestedByUserId: input.actorUserId,
      reviewedByUserId: null,
    };
    this.approvals.push(approval);
    await this.recordAudit({
      actorUserId: input.actorUserId,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      action: "create_escalation",
      outcome: "pending",
      sanitizedPayload: { amountCents: input.amountCents },
    });
    return approval;
  }

  async reviewApproval(input: {
    orgId: string;
    caseId: string;
    approvalId: string;
    decision: "approve" | "reject";
    actorUserId: string;
  }) {
    const approval = this.approvals.find(
      (candidate) => candidate.id === input.approvalId && candidate.supportCaseId === input.caseId,
    );
    if (!approval || approval.orgId !== input.orgId || approval.status !== "PENDING") return null;
    approval.status = input.decision === "approve" ? "APPROVED" : "REJECTED";
    approval.reviewedByUserId = input.actorUserId;
    return approval;
  }

  async listCredits(caseId: string) {
    return this.credits.filter((credit) => credit.supportCaseId === caseId);
  }

  async saveInvestigation(input: {
    supportCaseId: string;
    userId: string;
    findings: unknown;
    attempts: Array<Omit<StoredAttempt, "id" | "investigationId" | "createdAt">>;
  }) {
    const investigation: StoredInvestigation = {
      id: `inv_${randomUUID()}`,
      supportCaseId: input.supportCaseId,
      userId: input.userId,
      status: "COMPLETE",
      findings: input.findings,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    this.investigations.push(investigation);
    for (const attempt of input.attempts) {
      this.attempts.push({
        ...attempt,
        id: `attempt_${randomUUID()}`,
        investigationId: investigation.id,
        createdAt: new Date().toISOString(),
      });
    }
    return investigation;
  }

  async listInvestigations(caseId: string) {
    return this.investigations.filter((investigation) => investigation.supportCaseId === caseId);
  }

  async getInvestigation(id: string) {
    const investigation = this.investigations.find((candidate) => candidate.id === id);
    if (!investigation) return null;
    return {
      investigation,
      attempts: this.attempts.filter((attempt) => attempt.investigationId === id),
    };
  }

  async listAttempts(caseId: string) {
    return this.attempts.filter((attempt) => attempt.supportCaseId === caseId);
  }

  async listAudit(caseId: string) {
    return this.audits.filter((audit) => audit.supportCaseId === caseId);
  }

  async recordAudit(input: Omit<StoredAudit, "id" | "timestamp">) {
    this.audits.push({ ...input, id: `audit_${randomUUID()}`, timestamp: new Date().toISOString() });
  }

  private incidentCalls(orgId: string): EvidenceCall[] {
    return this.calls
      .filter(
        (call) =>
          call.orgId === orgId &&
          call.status === "FAILED" &&
          inWindow(call.startedAt, FLAGSHIP_WINDOW.start, FLAGSHIP_WINDOW.end),
      )
      .map((call) => {
        const bill = this.billing.find((entry) => entry.callId === call.id);
        return {
          id: call.id,
          failureCategory: call.failureCategory,
          requestId: call.requestId,
          traceId: call.traceId,
          startedAt: call.startedAt,
          amountCents: bill?.amountCents ?? 0,
          billingStatus: bill?.status ?? "MISSING",
          eligible: isEligibleFailure(call.failureCategory) && bill?.status === "POSTED",
        };
      });
  }

  private entriesFor(orgId: string, kind: "safe" | "eligible") {
    return this.billing.filter((entry) => {
      if (entry.orgId !== orgId || entry.type !== "CHARGE") return false;
      const call = this.calls.find((candidate) => candidate.id === entry.callId);
      if (!call || !inWindow(call.startedAt, FLAGSHIP_WINDOW.start, FLAGSHIP_WINDOW.end)) return false;
      if (kind === "safe") return call.failureCategory === "telephony_provider";
      return isEligibleFailure(call.failureCategory);
    });
  }

  private sum(orgId: string, kind: "safe" | "eligible") {
    return this.entriesFor(orgId, kind)
      .filter((entry) => entry.status === "POSTED")
      .reduce((total, entry) => total + entry.amountCents, 0);
  }

  private hasApproval(caseId: string, amountCents: number) {
    return this.approvals.some(
      (approval) =>
        approval.supportCaseId === caseId && approval.amountCents === amountCents && approval.status === "APPROVED",
    );
  }
}

export function toBilling(entry: BillingRow): BillingEntryRecord {
  return {
    id: entry.id,
    orgId: entry.orgId,
    callId: entry.callId,
    amountCents: entry.amountCents,
    currency: "USD",
    type: "CHARGE",
    status: entry.status === "CREDITED" ? "CREDITED" : "POSTED",
    createdAt: entry.createdAt,
  };
}
