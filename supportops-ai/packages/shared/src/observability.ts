/**
 * Ports for later milestones. No adapter in this package talks to a service.
 * Implementations must enforce org scope, time bounds, and result caps themselves.
 */

export type JsonObject = Record<string, unknown>;

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export type AxiomLogRecord = {
  id: string;
  orgId: string;
  callId: string | null;
  requestId: string | null;
  timestamp: string;
  severity: string;
  service: string;
  eventType: string;
  message: string;
  safeMetadata: JsonObject;
};

export type AxiomSearchQuery = {
  orgId: string;
  start: string;
  end: string;
  severity?: string;
  callId?: string;
  requestId?: string;
  eventType?: string;
  limit: number;
  cursor?: string;
};

export interface AxiomAdapter {
  searchLogs(query: AxiomSearchQuery): Promise<Page<AxiomLogRecord>>;
}

export type ClickHouseEventRecord = {
  id: string;
  orgId: string;
  callId: string | null;
  requestId: string;
  timestamp: string;
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  eventType: string;
  safeRequestMetadata: JsonObject;
  safeResponseMetadata: JsonObject;
};

export interface ClickHouseAdapter {
  getCallEvents(query: {
    orgId: string;
    callIds?: string[];
    start: string;
    end: string;
    statusCodes?: number[];
    limit: number;
  }): Promise<Page<ClickHouseEventRecord>>;
  getRequestTimeline(query: { orgId: string; requestId: string }): Promise<ClickHouseEventRecord[]>;
}

export type TraceSpanRecord = {
  id: string;
  orgId: string;
  traceId: string;
  parentSpanId: string | null;
  callId: string | null;
  service: string;
  operation: string;
  startTime: string;
  durationMs: number;
  status: string;
  attributes: JsonObject;
};

export type MetricSampleRecord = {
  id: string;
  region: string;
  service: string;
  timestamp: string;
  metricName: string;
  value: number;
  tags: JsonObject;
};

export interface ChronosphereAdapter {
  getTrace(query: { orgId: string; traceId: string }): Promise<TraceSpanRecord[]>;
  getServiceMetrics(query: {
    region: string;
    service: string;
    metricName: string;
    start: string;
    end: string;
    granularity: string;
  }): Promise<MetricSampleRecord[]>;
}

export type FeatureFlagSnapshotRecord = {
  id: string;
  orgId: string;
  flagKey: string;
  enabled: boolean;
  revision: number;
  observedAt: string;
};

export interface PostHogAdapter {
  getOrgFeatureFlags(query: { orgId: string }): Promise<FeatureFlagSnapshotRecord[]>;
  getFlagRevision(query: { orgId: string; flagKey: string }): Promise<FeatureFlagSnapshotRecord | null>;
  /**
   * Restricted demo action. Presence on this port is not permission to call it.
   * Protected mode must fail closed until a verified AgntID policy denies it.
   */
  setFeatureFlag(command: {
    orgId: string;
    flagKey: string;
    enabled: boolean;
  }): Promise<FeatureFlagSnapshotRecord>;
}

export type BillingEntryRecord = {
  id: string;
  orgId: string;
  callId: string | null;
  amountCents: number;
  currency: "USD";
  type: "CHARGE" | "CREDIT" | "ADJUSTMENT";
  status: "POSTED" | "VOID" | "CREDITED";
  createdAt: string;
};

export type EligibleCredit = {
  orgId: string;
  caseId: string;
  currency: "USD";
  eligibleAmountCents: number;
  lineItems: Array<{ billingEntryId: string; amountCents: number; callId: string | null }>;
};

export type ApplyCreditCommand = {
  orgId: string;
  caseId: string;
  idempotencyKey: string;
  lineItems: Array<{ billingEntryId: string; amountCents: number }>;
};

export type AppliedCredit = {
  creditId: string;
  idempotencyKey: string;
  amountCents: number;
  currency: "USD";
  replayed: boolean;
};

export interface BillingAdapter {
  getBilledCalls(query: { orgId: string; callIds?: string[] }): Promise<BillingEntryRecord[]>;
  calculateEligibleCredit(query: {
    orgId: string;
    caseId: string;
    callIds: string[];
  }): Promise<EligibleCredit>;
  applyCredit(command: ApplyCreditCommand): Promise<AppliedCredit>;
}
