import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { flagshipSummary, IDS } from "@supportops/mock-data";
import { buildServer } from "./server.js";

const SESSION_SECRET = "test-session-secret-value-32b";

describe("flagship investigation and credits", () => {
  let app: FastifyInstance;
  let maya: { cookie: string; csrf: string };
  let jordan: { cookie: string; csrf: string };

  beforeAll(async () => {
    app = await buildServer({
      repo: new (await import("./db/memory-repository.js")).InMemorySupportOpsRepository(),
      sessionSecret: SESSION_SECRET,
      webOrigin: "http://localhost:3000",
      demoMode: true,
      logger: false,
    });
    maya = await login(app, "maya.chen@supportops.demo");
    jordan = await login(app, "jordan.hale@supportops.demo");
  });

  afterAll(async () => {
    await app.close();
  });

  it("seeds exactly 47 incident calls and hides the other organization", async () => {
    expect(flagshipSummary.failedCalls).toBe(47);
    const response = await app.inject({
      method: "GET",
      url: `/api/cases/${IDS.flagship}/evidence`,
      headers: { cookie: maya.cookie },
    });
    expect(response.statusCode).toBe(200);
    const evidence = response.json().evidence;
    expect(evidence.failedCallCount).toBe(47);
    expect(evidence.eligibleAmountCents).toBe(flagshipSummary.eligibleAmountCents);
    expect(evidence.safeAmountCents).toBe(flagshipSummary.safeAmountCents);
    expect(evidence.safeAmountCents).toBeLessThanOrEqual(evidence.capCents);
    expect(evidence.eligibleAmountCents).toBeGreaterThan(evidence.capCents);
    expect(evidence.logs.every((log: { orgId: string }) => log.orgId === IDS.org101)).toBe(true);
    expect(evidence.logs).toHaveLength(47);
    expect(evidence.metrics).toEqual([]);
  });

  it("diagnoses the case from tool results and does not apply a credit", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/investigations`,
      headers: { cookie: maya.cookie, "x-csrf-token": maya.csrf },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const findings = response.json().findings;
    expect(findings.investigator).toBe("deterministic");
    expect(findings.agntid).toBe("UNCONFIGURED");
    expect(findings.affectedCallIds).toHaveLength(47);
    expect(findings.credit.safeAmountCents).toBe(flagshipSummary.safeAmountCents);
    expect(findings.credit.eligibleAmountCents).toBe(flagshipSummary.eligibleAmountCents);
    expect(JSON.stringify(findings)).not.toContain("providerDecisionId");

    const proposed = await app.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/credits/propose`,
      headers: { cookie: maya.cookie, "x-csrf-token": maya.csrf },
      payload: { kind: "safe" },
    });
    expect(proposed.statusCode).toBe(200);
    expect(proposed.json().credit.amountCents).toBe(flagshipSummary.safeAmountCents);
    expect(proposed.json().credit.state).toBe("PROPOSED");
  });

  it("blocks an over-cap credit until approval, then applies it once", async () => {
    const desk = await buildServer({
      repo: new (await import("./db/memory-repository.js")).InMemorySupportOpsRepository(),
      sessionSecret: SESSION_SECRET,
      webOrigin: "http://localhost:3000",
      demoMode: true,
      logger: false,
    });
    const senior = await login(desk, "jordan.hale@supportops.demo");
    const proposed = await desk.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/credits/propose`,
      headers: { cookie: senior.cookie, "x-csrf-token": senior.csrf },
      payload: { kind: "eligible" },
    });
    expect(proposed.statusCode).toBe(200);
    const key = proposed.json().credit.idempotencyKey as string;
    const blocked = await desk.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/credits/apply`,
      headers: { cookie: senior.cookie, "x-csrf-token": senior.csrf },
      payload: { idempotencyKey: key },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toMatch(/backend cap/i);

    const unchanged = await desk.inject({
      method: "GET",
      url: `/api/cases/${IDS.flagship}/evidence`,
      headers: { cookie: senior.cookie },
    });
    expect(unchanged.json().evidence.eligibleAmountCents).toBe(flagshipSummary.eligibleAmountCents);

    const escalation = await desk.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/escalations`,
      headers: { cookie: senior.cookie, "x-csrf-token": senior.csrf },
      payload: { amountCents: flagshipSummary.eligibleAmountCents, reason: "Full platform-failure credit." },
    });
    expect(escalation.statusCode).toBe(200);
    const approvalId = escalation.json().approval.id as string;
    const approved = await desk.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/approvals/${approvalId}`,
      headers: { cookie: senior.cookie, "x-csrf-token": senior.csrf },
      payload: { decision: "approve" },
    });
    expect(approved.statusCode).toBe(200);

    const applied = await desk.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/credits/apply`,
      headers: { cookie: senior.cookie, "x-csrf-token": senior.csrf },
      payload: { idempotencyKey: key },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().replayed).toBe(false);
    expect(applied.json().agntid).toBe("UNCONFIGURED");

    const replay = await desk.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/credits/apply`,
      headers: { cookie: senior.cookie, "x-csrf-token": senior.csrf },
      payload: { idempotencyKey: key },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().replayed).toBe(true);

    const after = await desk.inject({
      method: "GET",
      url: `/api/cases/${IDS.flagship}/evidence`,
      headers: { cookie: senior.cookie },
    });
    expect(after.json().evidence.eligibleAmountCents).toBe(0);
    expect(after.json().evidence.failedCallCount).toBe(47);
    await desk.close();
  });

  it("does not execute a restricted tool or invent an AgntID denial", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/api/cases/${IDS.flagship}/evidence`,
      headers: { cookie: jordan.cookie },
    });
    const revision = before.json().evidence.flags.find(
      (flag: { flagKey: string }) => flag.flagKey === "telephony_provider_failover",
    ).revision;
    const response = await app.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/tools`,
      headers: { cookie: jordan.cookie, "x-csrf-token": jordan.csrf },
      payload: { tool: "set_feature_flag", arguments: { flagKey: "telephony_provider_failover", enabled: true, orgId: IDS.org999 } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ executed: false, agntid: "UNCONFIGURED", backend: "DENIED" });
    expect(JSON.stringify(response.json())).not.toContain("providerDecisionId");
    const after = await app.inject({
      method: "GET",
      url: `/api/cases/${IDS.flagship}/evidence`,
      headers: { cookie: jordan.cookie },
    });
    expect(
      after.json().evidence.flags.find((flag: { flagKey: string }) => flag.flagKey === "telephony_provider_failover")
        .revision,
    ).toBe(revision);
  });
});

async function login(app: FastifyInstance, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/demo/login",
    payload: { email },
  });
  expect(response.statusCode).toBe(200);
  const header = response.headers["set-cookie"];
  const lines = Array.isArray(header) ? header : typeof header === "string" ? [header] : [];
  const pairs = lines.map((line) => line.split(";")[0] ?? "").filter(Boolean);
  const csrfPair = pairs.find((pair) => pair.startsWith("supportops_csrf="));
  const csrf = csrfPair ? decodeURIComponent(csrfPair.slice("supportops_csrf=".length)) : "";
  return { cookie: pairs.join("; "), csrf };
}
