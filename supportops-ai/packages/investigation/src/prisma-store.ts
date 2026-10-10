import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@supportops/db";
import {
  CREDIT_CAP_CENTS,
  FLAGSHIP_WINDOW,
  isEligibleFailure,
  type AxiomLogRecord,
  type BillingEntryRecord,
  type ClickHouseEventRecord,
  type FeatureFlagSnapshotRecord,
  type MetricSampleRecord,
  type TraceSpanRecord,
} from "@supportops/shared";
import type {
  EvidenceReport,
  InvestigationStore,
  StoredApproval,
  StoredAttempt,
  StoredAudit,
  StoredCredit,
  StoredInvestigation,
} from "./store.js";

function kindOf(reason: string): "safe" | "eligible" {
  return reason.startsWith("eligible:") ? "eligible" : "safe";
}

function creditFrom(row: {
  id: string;
  orgId: string;
  supportCaseId: string;
  amountCents: number;
  reason: string;
  state: "PROPOSED" | "APPROVED" | "APPLIED" | "REJECTED";
  idempotencyKey: string;
  createdAt: Date;
  appliedAt: Date | null;
}): StoredCredit {
  return {
    id: row.id,
    orgId: row.orgId,
    supportCaseId: row.supportCaseId,
    amountCents: row.amountCents,
    currency: "USD",
    reason: row.reason,
    kind: kindOf(row.reason),
    state: row.state === "APPLIED" ? "APPLIED" : row.state === "REJECTED" ? "REJECTED" : "PROPOSED",
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
  };
}

export class PrismaInvestigationStore implements InvestigationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async evidence(orgId: string, includeMetrics: boolean, includeFlags: boolean): Promise<EvidenceReport> {
    const calls = await this.incidentCalls(orgId);
    const [logs, events, flags, metrics] = await Promise.all([
      this.searchLogs({ orgId, start: FLAGSHIP_WINDOW.start, end: FLAGSHIP_WINDOW.end, limit: 100 }),
      this.getCallEvents({ orgId, start: FLAGSHIP_WINDOW.start, end: FLAGSHIP_WINDOW.end, limit: 100 }),
      includeFlags ? this.getFlags(orgId) : Promise.resolve([]),
      includeMetrics
        ? this.getMetrics({
            region: "us-east-1",
            service: "voice-edge",
            metricName: "request_error_ratio",
            start: FLAGSHIP_WINDOW.start,
            end: FLAGSHIP_WINDOW.end,
          })
        : Promise.resolve([]),
    ]);
    const posted = calls.filter((call) => call.billingStatus === "POSTED");
    return {
      window: FLAGSHIP_WINDOW,
      failedCallCount: calls.length,
      eligibleAmountCents: posted.filter((call) => call.eligible).reduce((sum, call) => sum + call.amountCents, 0),
      safeAmountCents: posted
        .filter((call) => call.failureCategory === "telephony_provider")
        .reduce((sum, call) => sum + call.amountCents, 0),
      capCents: CREDIT_CAP_CENTS,
      calls,
      logs: logs.items,
      events: events.items,
      flags,
      metrics,
    };
  }

  async searchLogs(query: { orgId: string; start: string; end: string; severity?: string; limit: number }) {
    const rows = await this.prisma.axiomLog.findMany({
      where: {
        orgId: query.orgId,
        timestamp: { gte: new Date(query.start), lt: new Date(query.end) },
        ...(query.severity ? { severity: query.severity } : {}),
      },
      orderBy: { timestamp: "desc" },
      take: Math.min(query.limit, 100),
    });
    const items: AxiomLogRecord[] = rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      callId: row.callId,
      requestId: row.requestId,
      timestamp: row.timestamp.toISOString(),
      severity: row.severity,
      service: row.service,
      eventType: row.eventType,
      message: row.message,
      safeMetadata: asRecord(row.safeMetadata),
    }));
    return { items, nextCursor: null };
  }

  async getCallEvents(query: { orgId: string; start: string; end: string; callIds?: string[]; limit: number }) {
    const rows = await this.prisma.clickHouseEvent.findMany({
      where: {
        orgId: query.orgId,
        timestamp: { gte: new Date(query.start), lt: new Date(query.end) },
        ...(query.callIds ? { callId: { in: query.callIds } } : {}),
      },
      orderBy: { timestamp: "asc" },
      take: Math.min(query.limit, 100),
    });
    const items: ClickHouseEventRecord[] = rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      callId: row.callId,
      requestId: row.requestId,
      timestamp: row.timestamp.toISOString(),
      endpoint: row.endpoint,
      statusCode: row.statusCode,
      latencyMs: row.latencyMs,
      eventType: row.eventType,
      safeRequestMetadata: asRecord(row.safeRequestMetadata),
      safeResponseMetadata: asRecord(row.safeResponseMetadata),
    }));
    return { items, nextCursor: null };
  }

  async getTrace(orgId: string, traceId: string): Promise<TraceSpanRecord[]> {
    const rows = await this.prisma.traceSpan.findMany({ where: { orgId, traceId }, orderBy: { startTime: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      traceId: row.traceId,
      parentSpanId: row.parentSpanId,
      callId: row.callId,
      service: row.service,
      operation: row.operation,
      startTime: row.startTime.toISOString(),
      durationMs: row.durationMs,
      status: row.status,
      attributes: asRecord(row.attributes),
    }));
  }

  async getMetrics(query: { region: string; service: string; metricName: string; start: string; end: string }) {
    const rows = await this.prisma.metricSample.findMany({
      where: {
        region: query.region,
        service: query.service,
        metricName: query.metricName,
        timestamp: { gte: new Date(query.start), lt: new Date(query.end) },
      },
      orderBy: { timestamp: "asc" },
    });
    return rows.map(
      (row): MetricSampleRecord => ({
        id: row.id,
        region: row.region,
        service: row.service,
        timestamp: row.timestamp.toISOString(),
        metricName: row.metricName,
        value: row.value,
        tags: asStringRecord(row.tags),
      }),
    );
  }

  async getFlags(orgId: string): Promise<FeatureFlagSnapshotRecord[]> {
    const rows = await this.prisma.featureFlagSnapshot.findMany({ where: { orgId }, orderBy: { flagKey: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      flagKey: row.flagKey,
      enabled: row.enabled,
      revision: row.revision,
      observedAt: row.observedAt.toISOString(),
    }));
  }

  async flagRevision(orgId: string, flagKey: string) {
    const row = await this.prisma.featureFlagSnapshot.findFirst({ where: { orgId, flagKey } });
    return row?.revision ?? null;
  }

  async setFeatureFlag(orgId: string, flagKey: string, enabled: boolean) {
    const existing = await this.prisma.featureFlagSnapshot.findFirst({ where: { orgId, flagKey } });
    const observedAt = new Date();
    const row = existing
      ? await this.prisma.featureFlagSnapshot.update({
          where: { id: existing.id },
          data: { enabled, revision: existing.revision + 1, observedAt },
        })
      : await this.prisma.featureFlagSnapshot.create({
          data: {
            id: `flag_${randomUUID()}`,
            orgId,
            flagKey,
            enabled,
            revision: 1,
            observedAt,
          },
        });
    return {
      id: row.id,
      orgId: row.orgId,
      flagKey: row.flagKey,
      enabled: row.enabled,
      revision: row.revision,
      observedAt: row.observedAt.toISOString(),
    };
  }

  async getBilling(orgId: string, callIds: string[]): Promise<BillingEntryRecord[]> {
    const rows = await this.prisma.billingEntry.findMany({ where: { orgId, callId: { in: callIds } } });
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      callId: row.callId,
      amountCents: row.amountCents,
      currency: "USD",
      type: "CHARGE",
      status: row.status === "CREDITED" ? "CREDITED" : "POSTED",
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async proposeCredit(input: { orgId: string; caseId: string; kind: "safe" | "eligible"; actorUserId: string }) {
    const report = await this.evidence(input.orgId, false, false);
    const amountCents = input.kind === "safe" ? report.safeAmountCents : report.eligibleAmountCents;
    if (amountCents <= 0) return { type: "empty" as const };
    const idempotencyKey = `propose:${input.caseId}:${input.kind}`;
    const existing = await this.prisma.credit.findUnique({ where: { idempotencyKey } });
    if (existing) return { credit: creditFrom(existing), replayed: true };
    const created = await this.prisma.credit.create({
      data: {
        id: `credit_${randomUUID()}`,
        orgId: input.orgId,
        supportCaseId: input.caseId,
        amountCents,
        currency: "USD",
        reason:
          input.kind === "safe"
            ? "safe: Telephony-provider charges under the backend cap."
            : "eligible: All platform-failure charges.",
        state: "PROPOSED",
        idempotencyKey,
        createdAt: new Date(),
      },
    });
    await this.recordAudit({
      actorUserId: input.actorUserId,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      action: "propose_credit",
      outcome: "proposed",
      sanitizedPayload: { amountCents, kind: input.kind, agntid: "UNCONFIGURED" },
    });
    return { credit: creditFrom(created), replayed: false };
  }

  async applyCredit(input: { orgId: string; caseId: string; idempotencyKey: string; actorUserId: string }) {
    const credit = await this.prisma.credit.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (!credit || credit.supportCaseId !== input.caseId || credit.orgId !== input.orgId) return { type: "missing" as const };
    if (credit.state === "APPLIED") return { type: "ok" as const, credit: creditFrom(credit), replayed: true };
    if (credit.amountCents > CREDIT_CAP_CENTS) {
      const approved = await this.prisma.approvalRequest.findFirst({
        where: { supportCaseId: input.caseId, status: "APPROVED" },
      });
      const amount = approved ? amountOf(approved.proposedAction) : null;
      if (amount !== credit.amountCents) return { type: "cap" as const };
    }
    const kind = kindOf(credit.reason);
    const calls = await this.incidentCalls(input.orgId);
    const selected = calls.filter(
      (call) =>
        call.billingStatus === "POSTED" &&
        (kind === "safe" ? call.failureCategory === "telephony_provider" : call.eligible || isEligibleFailure(call.failureCategory)),
    );
    const available = selected.reduce((sum, call) => sum + call.amountCents, 0);
    if (available !== credit.amountCents) return { type: "shortfall" as const };
    const entryIds = (
      await this.prisma.billingEntry.findMany({
        where: { orgId: input.orgId, callId: { in: selected.map((call) => call.id) }, status: "POSTED" },
        select: { id: true, callId: true, amountCents: true },
      })
    ).filter((entry) => selected.some((call) => call.id === entry.callId));
    await this.prisma.$transaction(async (tx) => {
      await tx.credit.update({
        where: { id: credit.id },
        data: { state: "APPLIED", appliedAt: new Date() },
      });
      await tx.creditLineItem.createMany({
        data: entryIds.map((entry) => ({
          id: `line_${credit.id}_${entry.id}`,
          creditId: credit.id,
          billingEntryId: entry.id,
          amountCents: entry.amountCents,
        })),
      });
      await tx.billingEntry.updateMany({
        where: { id: { in: entryIds.map((entry) => entry.id) } },
        data: { status: "CREDITED" },
      });
    });
    await this.recordAudit({
      actorUserId: input.actorUserId,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      action: "apply_credit",
      outcome: "applied",
      sanitizedPayload: { amountCents: credit.amountCents, agntid: "UNCONFIGURED", backend: "ALLOWED" },
    });
    const updated = await this.prisma.credit.findUniqueOrThrow({ where: { id: credit.id } });
    return { type: "ok" as const, credit: creditFrom(updated), replayed: false };
  }

  async escalate(input: {
    orgId: string;
    caseId: string;
    amountCents: number;
    reason: string;
    actorUserId: string;
  }) {
    const pending = await this.prisma.approvalRequest.findFirst({
      where: { supportCaseId: input.caseId, status: "PENDING" },
    });
    if (pending && amountOf(pending.proposedAction) === input.amountCents) return approvalFrom(pending, input.orgId);
    const created = await this.prisma.approvalRequest.create({
      data: {
        id: `approval_${randomUUID()}`,
        supportCaseId: input.caseId,
        proposedAction: { amountCents: input.amountCents, reason: input.reason },
        status: "PENDING",
        requestedByUserId: input.actorUserId,
      },
    });
    await this.recordAudit({
      actorUserId: input.actorUserId,
      orgId: input.orgId,
      supportCaseId: input.caseId,
      action: "create_escalation",
      outcome: "pending",
      sanitizedPayload: { amountCents: input.amountCents },
    });
    return approvalFrom(created, input.orgId);
  }

  async reviewApproval(input: {
    orgId: string;
    caseId: string;
    approvalId: string;
    decision: "approve" | "reject";
    actorUserId: string;
  }) {
    const row = await this.prisma.approvalRequest.findUnique({ where: { id: input.approvalId } });
    if (!row || row.supportCaseId !== input.caseId || row.status !== "PENDING") return null;
    const supportCase = await this.prisma.supportCase.findUnique({ where: { id: input.caseId } });
    if (!supportCase || supportCase.orgId !== input.orgId) return null;
    const updated = await this.prisma.approvalRequest.update({
      where: { id: row.id },
      data: {
        status: input.decision === "approve" ? "APPROVED" : "REJECTED",
        reviewedByUserId: input.actorUserId,
        reviewedAt: new Date(),
      },
    });
    return approvalFrom(updated, input.orgId);
  }

  async listCredits(caseId: string) {
    const rows = await this.prisma.credit.findMany({ where: { supportCaseId: caseId }, orderBy: { createdAt: "desc" } });
    return rows.map(creditFrom);
  }

  async saveInvestigation(input: {
    supportCaseId: string;
    userId: string;
    findings: unknown;
    attempts: Array<Omit<StoredAttempt, "id" | "investigationId" | "createdAt">>;
  }) {
    const id = `inv_${randomUUID()}`;
    const created = await this.prisma.investigation.create({
      data: {
        id,
        supportCaseId: input.supportCaseId,
        userId: input.userId,
        status: "COMPLETE",
        findings: input.findings as object,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    for (const attempt of input.attempts) {
      await this.prisma.toolAttempt.create({
        data: {
          id: `attempt_${randomUUID()}`,
          investigationId: created.id,
          supportCaseId: attempt.supportCaseId,
          actorUserId: attempt.actorUserId,
          orgId: attempt.orgId,
          toolName: attempt.toolName,
          sanitizedArguments: attempt.sanitizedArguments as object,
          mode: "PROTECTED",
          authorizationStatus: attempt.authorizationStatus,
          executed: attempt.executed,
          executionStatus: attempt.executionStatus,
          reasonCode: attempt.reasonCode,
          createdAt: new Date(),
        },
      });
    }
    return {
      id: created.id,
      supportCaseId: created.supportCaseId,
      userId: created.userId,
      status: created.status,
      findings: created.findings,
      startedAt: created.startedAt.toISOString(),
      finishedAt: created.finishedAt?.toISOString() ?? null,
    };
  }

  async listInvestigations(caseId: string): Promise<StoredInvestigation[]> {
    const rows = await this.prisma.investigation.findMany({
      where: { supportCaseId: caseId },
      orderBy: { startedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      supportCaseId: row.supportCaseId,
      userId: row.userId,
      status: row.status,
      findings: row.findings,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }));
  }

  async getInvestigation(id: string) {
    const row = await this.prisma.investigation.findUnique({ where: { id }, include: { toolAttempts: true } });
    if (!row) return null;
    return {
      investigation: {
        id: row.id,
        supportCaseId: row.supportCaseId,
        userId: row.userId,
        status: row.status,
        findings: row.findings,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
      },
      attempts: row.toolAttempts.map(attemptFrom),
    };
  }

  async listAttempts(caseId: string) {
    const rows = await this.prisma.toolAttempt.findMany({
      where: { supportCaseId: caseId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(attemptFrom);
  }

  async listAudit(caseId: string) {
    const rows = await this.prisma.auditEvent.findMany({
      where: { supportCaseId: caseId },
      orderBy: { timestamp: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId ?? "",
      orgId: row.orgId ?? "",
      supportCaseId: row.supportCaseId ?? caseId,
      action: row.action,
      outcome: row.outcome,
      sanitizedPayload: asRecord(row.sanitizedPayload),
      timestamp: row.timestamp.toISOString(),
    }));
  }

  async recordAudit(input: Omit<StoredAudit, "id" | "timestamp">) {
    await this.prisma.auditEvent.create({
      data: {
        id: `audit_${randomUUID()}`,
        actorUserId: input.actorUserId,
        orgId: input.orgId,
        supportCaseId: input.supportCaseId,
        action: input.action,
        outcome: input.outcome,
        sanitizedPayload: input.sanitizedPayload as object,
        timestamp: new Date(),
      },
    });
  }

  private async incidentCalls(orgId: string) {
    const rows = await this.prisma.call.findMany({
      where: {
        orgId,
        status: "FAILED",
        startedAt: { gte: new Date(FLAGSHIP_WINDOW.start), lt: new Date(FLAGSHIP_WINDOW.end) },
      },
      include: { billingEntries: true },
      orderBy: { startedAt: "asc" },
    });
    return rows.map((call) => {
      const bill = call.billingEntries.find((entry) => entry.type === "CHARGE");
      return {
        id: call.id,
        failureCategory: call.failureCategory,
        requestId: call.requestId,
        traceId: call.traceId,
        startedAt: call.startedAt.toISOString(),
        amountCents: bill?.amountCents ?? 0,
        billingStatus: bill?.status ?? "MISSING",
        eligible: isEligibleFailure(call.failureCategory) && bill?.status === "POSTED",
      };
    });
  }
}

function attemptFrom(row: {
  id: string;
  investigationId: string | null;
  supportCaseId: string | null;
  actorUserId: string;
  orgId: string;
  toolName: string;
  sanitizedArguments: unknown;
  authorizationStatus: string;
  executed: boolean;
  executionStatus: string;
  reasonCode: string | null;
  createdAt: Date;
}): StoredAttempt {
  const authorizationStatus = (["ALLOWED", "DENIED", "UNAVAILABLE", "MALFORMED"].includes(row.authorizationStatus)
    ? row.authorizationStatus
    : "UNAVAILABLE") as StoredAttempt["authorizationStatus"];
  const executionStatus = (["NOT_EXECUTED", "SUCCEEDED", "FAILED"].includes(row.executionStatus)
    ? row.executionStatus
    : "NOT_EXECUTED") as StoredAttempt["executionStatus"];
  return {
    id: row.id,
    investigationId: row.investigationId,
    supportCaseId: row.supportCaseId ?? "",
    actorUserId: row.actorUserId,
    orgId: row.orgId,
    toolName: row.toolName,
    sanitizedArguments: asRecord(row.sanitizedArguments),
    authorizationStatus,
    executed: row.executed,
    executionStatus,
    reasonCode: row.reasonCode ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

function approvalFrom(
  row: { id: string; supportCaseId: string; proposedAction: unknown; status: StoredApproval["status"]; requestedByUserId: string; reviewedByUserId: string | null },
  orgId: string,
): StoredApproval {
  return {
    id: row.id,
    orgId,
    supportCaseId: row.supportCaseId,
    amountCents: amountOf(row.proposedAction) ?? 0,
    reason: typeof asRecord(row.proposedAction).reason === "string" ? String(asRecord(row.proposedAction).reason) : "",
    status: row.status,
    requestedByUserId: row.requestedByUserId,
    reviewedByUserId: row.reviewedByUserId,
  };
}

function amountOf(value: unknown): number | null {
  const record = asRecord(value);
  return typeof record.amountCents === "number" ? record.amountCents : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, String(item)]));
}
