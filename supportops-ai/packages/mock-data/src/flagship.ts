import { FLAGSHIP_WINDOW, isEligibleFailure } from "@supportops/shared";
import { IDS, type SeedCall } from "./fixtures.js";

export type SeedLog = {
  id: string;
  orgId: string;
  callId: string | null;
  requestId: string | null;
  timestamp: string;
  severity: string;
  service: string;
  eventType: string;
  message: string;
  safeMetadata: Record<string, string | number | boolean | null>;
};

export type SeedClickHouseEvent = {
  id: string;
  orgId: string;
  callId: string | null;
  requestId: string;
  timestamp: string;
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  eventType: string;
  safeRequestMetadata: Record<string, string | number | boolean | null>;
  safeResponseMetadata: Record<string, string | number | boolean | null>;
};

export type SeedSpan = {
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
  attributes: Record<string, string | number | boolean | null>;
};

export type SeedMetric = {
  id: string;
  region: string;
  service: string;
  timestamp: string;
  metricName: string;
  value: number;
  tags: Record<string, string>;
};

export type SeedFlag = {
  id: string;
  orgId: string;
  flagKey: string;
  enabled: boolean;
  revision: number;
  observedAt: string;
};

export type SeedBilling = {
  id: string;
  orgId: string;
  callId: string | null;
  amountCents: number;
  currency: "USD";
  type: "CHARGE";
  status: "POSTED" | "CREDITED";
  createdAt: string;
};

const GROUPS = [
  {
    category: "telephony_provider",
    count: 30,
    amountCents: 150,
    statusCode: 502,
    endpoint: "/v1/calls",
    service: "telephony-provider",
    message: "Telephony provider returned 502 before media connected.",
  },
  {
    category: "webhook_timeout",
    count: 10,
    amountCents: 120,
    statusCode: 504,
    endpoint: "/v1/webhooks/call-ended",
    service: "webhook-dispatcher",
    message: "Call-ended webhook timed out after the provider accepted the call.",
  },
  {
    category: "invalid_assistant_config",
    count: 7,
    amountCents: 200,
    statusCode: 422,
    endpoint: "/v1/assistants/session",
    service: "assistant-config",
    message: "Assistant configuration was rejected. The charge is not eligible for credit.",
  },
] as const;

const origin = Date.parse("2026-10-09T12:00:00.000Z");

function buildFlagship() {
  const calls: SeedCall[] = [];
  const logs: SeedLog[] = [];
  const events: SeedClickHouseEvent[] = [];
  const spans: SeedSpan[] = [];
  const billing: SeedBilling[] = [];
  let index = 0;

  for (const group of GROUPS) {
    for (let offset = 0; offset < group.count; offset += 1) {
      index += 1;
      const suffix = String(index).padStart(3, "0");
      const id = `call_fw_${suffix}`;
      const started = new Date(origin + index * 60_000).toISOString();
      const ended = new Date(origin + index * 60_000 + 4_000).toISOString();
      const requestId = `req_fw_${suffix}`;
      const traceId = `trace_fw_${suffix}`;
      calls.push({
        id,
        orgId: IDS.org101,
        customerId: IDS.cusAna,
        assistantId: "asst_northwind",
        startedAt: started,
        endedAt: ended,
        status: "FAILED",
        failureCategory: group.category,
        durationSeconds: 4,
        requestId,
        traceId,
        region: "us-east-1",
      });
      logs.push({
        id: `log_fw_${suffix}`,
        orgId: IDS.org101,
        callId: id,
        requestId,
        timestamp: started,
        severity: "error",
        service: group.service,
        eventType: group.category,
        message: group.message,
        safeMetadata: {
          failureCategory: group.category,
          incident: "flagship-47",
          billed: true,
          traceId,
          callId: id,
        },
      });
      events.push({
        id: `evt_fw_${suffix}`,
        orgId: IDS.org101,
        callId: id,
        requestId,
        timestamp: started,
        endpoint: group.endpoint,
        statusCode: group.statusCode,
        latencyMs: 800 + index * 15,
        eventType: "http_request",
        safeRequestMetadata: { callId: id, incident: "flagship-47" },
        safeResponseMetadata: { statusCode: group.statusCode, failureCategory: group.category },
      });
      spans.push(
        {
          id: `span_fw_${suffix}_root`,
          orgId: IDS.org101,
          traceId,
          parentSpanId: null,
          callId: id,
          service: "voice-edge",
          operation: "start_call",
          startTime: started,
          durationMs: 4000,
          status: "error",
          attributes: { region: "us-east-1", incident: "flagship-47" },
        },
        {
          id: `span_fw_${suffix}_child`,
          orgId: IDS.org101,
          traceId,
          parentSpanId: `span_fw_${suffix}_root`,
          callId: id,
          service: group.service,
          operation: group.category,
          startTime: started,
          durationMs: 1200,
          status: "error",
          attributes: { failureCategory: group.category },
        },
      );
      billing.push({
        id: `bill_fw_${suffix}`,
        orgId: IDS.org101,
        callId: id,
        amountCents: group.amountCents,
        currency: "USD",
        type: "CHARGE",
        status: "POSTED",
        createdAt: started,
      });
    }
  }

  logs.push({
    id: "log_org999_decoy",
    orgId: IDS.org999,
    callId: null,
    requestId: "req_internal_decoy",
    timestamp: "2026-10-09T13:00:00.000Z",
    severity: "error",
    service: "control-plane",
    eventType: "config_change",
    message: "Internal organization recorded a config change. It is not part of the Northwind incident.",
    safeMetadata: { incident: "not-flagship" },
  });

  const metrics: SeedMetric[] = [12, 13, 14, 15, 16, 17].map((hour, position) => ({
    id: `metric_use1_${hour}`,
    region: "us-east-1",
    service: "voice-edge",
    timestamp: `2026-10-09T${String(hour).padStart(2, "0")}:00:00.000Z`,
    metricName: "request_error_ratio",
    value: [0.04, 0.11, 0.28, 0.46, 0.31, 0.08][position] ?? 0,
    tags: { region: "us-east-1" },
  }));
  metrics.push({
    id: "metric_euw1_quiet",
    region: "eu-west-1",
    service: "voice-edge",
    timestamp: "2026-10-09T14:00:00.000Z",
    metricName: "request_error_ratio",
    value: 0.02,
    tags: { region: "eu-west-1" },
  });

  const flags: SeedFlag[] = [
    {
      id: "flag_101_failover",
      orgId: IDS.org101,
      flagKey: "telephony_provider_failover",
      enabled: false,
      revision: 4,
      observedAt: FLAGSHIP_WINDOW.start,
    },
    {
      id: "flag_101_webhook",
      orgId: IDS.org101,
      flagKey: "new_webhook_client",
      enabled: true,
      revision: 9,
      observedAt: FLAGSHIP_WINDOW.start,
    },
    {
      id: "flag_999_kill",
      orgId: IDS.org999,
      flagKey: "internal_kill_switch",
      enabled: true,
      revision: 2,
      observedAt: FLAGSHIP_WINDOW.start,
    },
  ];

  const eligibleAmountCents = billing
    .filter((entry) => {
      const call = calls.find((candidate) => candidate.id === entry.callId);
      return isEligibleFailure(call?.failureCategory);
    })
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const safeAmountCents = billing
    .filter((entry) => calls.find((candidate) => candidate.id === entry.callId)?.failureCategory === "telephony_provider")
    .reduce((sum, entry) => sum + entry.amountCents, 0);

  return { calls, logs, events, spans, metrics, flags, billing, eligibleAmountCents, safeAmountCents };
}

export const flagshipDataset = buildFlagship();
export const flagshipCalls = flagshipDataset.calls;

export const flagshipSummary = {
  failedCalls: flagshipDataset.calls.length,
  eligibleAmountCents: flagshipDataset.eligibleAmountCents,
  safeAmountCents: flagshipDataset.safeAmountCents,
  window: FLAGSHIP_WINDOW,
};
