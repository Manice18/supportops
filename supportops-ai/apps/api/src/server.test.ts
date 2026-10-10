import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { jwtVerify } from "jose";
import { IDS, seedAccess, seedCases, seedOrganizations, seedUsers } from "@supportops/mock-data";
import { InMemorySupportOpsRepository } from "./db/memory-repository.js";
import { buildServer } from "./server.js";

const SESSION_SECRET = "test-session-secret-value-32b";

describe("supportops api", () => {
  let app: FastifyInstance;
  let maya: { cookie: string; csrf: string };
  let jordan: { cookie: string; csrf: string };

  beforeAll(async () => {
    app = await buildServer({
      repo: new InMemorySupportOpsRepository(),
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

  it("reports health without claiming AgntID is connected", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      status: "ok",
      service: "supportops-api",
      demoMode: true,
      database: "ok",
      agntid: "UNCONFIGURED",
    });
    expect(JSON.stringify(body)).not.toContain("providerDecisionId");
  });

  it("rejects unauthenticated case reads", async () => {
    const response = await app.inject({ method: "GET", url: "/api/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("signs in a seeded engineer and ignores a client actor id", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/me?actor_id=${IDS.noor}`,
      headers: { cookie: maya.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("AUTHORITY_FIELD_REJECTED");

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: maya.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({
      id: IDS.maya,
      email: "maya.chen@supportops.demo",
      role: "CSE_ENTERPRISE",
    });
    expect(me.json().organizations.map((org: { id: string }) => org.id)).toEqual([IDS.org101]);
    expect(me.json().access.segment).toBe("enterprise");
    const verified = await jwtVerify(me.json().token.accessToken, new TextEncoder().encode(SESSION_SECRET), {
      issuer: "supportops-demo",
    });
    expect(verified.payload.sub).toBe(IDS.maya);
    expect(verified.payload.role).toBe("CSE_ENTERPRISE");
    expect(JSON.stringify(me.json())).not.toContain("providerDecisionId");
  });

  it("rejects a login body that tries to set authority", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/demo/login",
      payload: { email: "maya.chen@supportops.demo", actorId: IDS.noor, isAdmin: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("AUTHORITY_FIELD_REJECTED");
  });

  it("rejects an unknown demo email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/demo/login",
      payload: { email: "nobody@supportops.demo" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("lists only cases in the engineer's assigned organization", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/cases",
      headers: { cookie: maya.cookie },
    });
    expect(response.statusCode).toBe(200);
    const ids = response.json().cases.map((item: { id: string }) => item.id);
    expect(ids).toEqual([IDS.flagship, IDS.injection, IDS.latency]);
    expect(response.json().cases[0].orgName).toBe("Northwind Voice");
  });

  it("rejects an org filter and a case outside the engineer assignment", async () => {
    const filtered = await app.inject({
      method: "GET",
      url: `/api/cases?orgId=${IDS.org999}`,
      headers: { cookie: maya.cookie },
    });
    expect(filtered.statusCode).toBe(403);
    expect(filtered.json().error.code).toBe("FORBIDDEN");

    const contoso = await app.inject({
      method: "GET",
      url: `/api/cases/${IDS.contoso}`,
      headers: { cookie: maya.cookie },
    });
    expect(contoso.statusCode).toBe(403);

    const harbor = await app.inject({
      method: "GET",
      url: `/api/cases/${IDS.harbor}`,
      headers: { cookie: maya.cookie },
    });
    expect(harbor.statusCode).toBe(403);
  });

  it("lets the support lead open the Harbor case", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/cases/${IDS.harbor}`,
      headers: { cookie: jordan.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().case.orgId).toBe(IDS.org102);
  });

  it("returns not found for an unknown case id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/cases/case_missing",
      headers: { cookie: maya.cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("does not treat the admin role as an org bypass", async () => {
    const isolated = await buildServer({
      repo: new InMemorySupportOpsRepository({
        users: [
          ...seedUsers,
          {
            id: "user_admin_unassigned",
            email: "unassigned.admin@supportops.demo",
            displayName: "Unassigned Admin",
            role: "CSE_ENTERPRISE_SENIOR",
            createdAt: "2026-01-06T15:00:00.000Z",
          },
        ],
        organizations: seedOrganizations,
        access: seedAccess,
        cases: seedCases,
      }),
      sessionSecret: SESSION_SECRET,
      webOrigin: "http://localhost:3000",
      demoMode: true,
      logger: false,
    });
    const session = await login(isolated, "unassigned.admin@supportops.demo");
    const response = await isolated.inject({
      method: "GET",
      url: `/api/cases/${IDS.flagship}`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    await isolated.close();
  });

  it("requires CSRF before logout and then ends the session", async () => {
    const session = await login(app, "noor.hassan@supportops.demo");
    const missing = await app.inject({
      method: "POST",
      url: "/api/demo/logout",
      headers: { cookie: session.cookie },
      payload: {},
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe("CSRF_FAILED");

    const loggedOut = await app.inject({
      method: "POST",
      url: "/api/demo/logout",
      headers: { cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: {},
    });
    expect(loggedOut.statusCode).toBe(204);

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: session.cookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it("blocks a cross-tenant credit proposal before the milestone handler", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/cases/${IDS.contoso}/credits/propose`,
      headers: { cookie: maya.cookie, "x-csrf-token": maya.csrf },
      payload: { amountCents: 5_000_000 },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.message).not.toMatch(/applied/i);
  });

  it("rejects a line engineer applying a credit and does not claim an AgntID decision", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/cases/${IDS.flagship}/credits/apply`,
      headers: { cookie: maya.cookie, "x-csrf-token": maya.csrf },
      payload: { idempotencyKey: "propose:case_flagship_47:safe" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("ROLE_FORBIDDEN");
    expect(JSON.stringify(response.json())).not.toContain("providerDecisionId");
  });

  it("returns runnable scenarios without claiming AgntID is connected", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/demo/scenarios",
      headers: { cookie: maya.cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.agntid).toBe("UNCONFIGURED");
    expect(body.scenarios).toHaveLength(6);
    expect(body.scenarios.find((scenario: { id: string }) => scenario.id === "flagship-47")?.runnable).toBe(true);
  });

  it("rate limits demo login", async () => {
    const limited = await buildServer({
      repo: new InMemorySupportOpsRepository(),
      sessionSecret: SESSION_SECRET,
      webOrigin: "http://localhost:3000",
      demoMode: true,
      logger: false,
      loginRateLimit: 2,
    });
    const first = await limited.inject({
      method: "POST",
      url: "/api/demo/login",
      payload: { email: "nobody@supportops.demo" },
    });
    const second = await limited.inject({
      method: "POST",
      url: "/api/demo/login",
      payload: { email: "nobody@supportops.demo" },
    });
    const third = await limited.inject({
      method: "POST",
      url: "/api/demo/login",
      payload: { email: "nobody@supportops.demo" },
    });
    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("RATE_LIMITED");
    await limited.close();
  });

  it("disables demo reset when demo mode is off", async () => {
    const locked = await buildServer({
      repo: new InMemorySupportOpsRepository(),
      sessionSecret: SESSION_SECRET,
      webOrigin: "http://localhost:3000",
      demoMode: false,
      logger: false,
    });
    const session = await login(locked, seedUsers[0].email);
    const response = await locked.inject({
      method: "POST",
      url: "/api/demo/reset",
      headers: { cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("DEMO_DISABLED");
    await locked.close();
  });

  it("keeps a pay-as-you-go engineer inside that segment", async () => {
    const priya = await login(app, "priya.nair@supportops.demo");
    const own = await app.inject({
      method: "GET",
      url: "/api/cases",
      headers: { cookie: priya.cookie },
    });
    expect(own.statusCode).toBe(200);
    expect(own.json().cases.map((item: { id: string }) => item.id)).toEqual([IDS.brightcart]);

    const northwind = await app.inject({
      method: "GET",
      url: `/api/cases/${IDS.flagship}`,
      headers: { cookie: priya.cookie },
    });
    expect(northwind.statusCode).toBe(403);
    expect(northwind.json().error.code).toBe("FORBIDDEN");
  });

  it("redacts billing fields for a line engineer and shows them to a senior", async () => {
    const line = await app.inject({
      method: "GET",
      url: `/api/desk/customers/${IDS.cusAna}`,
      headers: { cookie: maya.cookie },
    });
    expect(line.statusCode).toBe(200);
    expect(line.json().customer.email).toBeNull();
    expect(line.json().customer.paymentLast4).toBeNull();

    const senior = await app.inject({
      method: "GET",
      url: `/api/desk/customers/${IDS.cusAna}`,
      headers: { cookie: jordan.cookie },
    });
    expect(senior.statusCode).toBe(200);
    expect(senior.json().customer.email).toBe("ana.kapoor@northwind.example");
    expect(senior.json().customer.paymentLast4).toBe("4242");
  });

  it("checks tools from the verified role and does not invent an AgntID decision", async () => {
    const priya = await login(app, "priya.nair@supportops.demo");
    const allowed = await app.inject({
      method: "POST",
      url: "/api/access/tools/check",
      headers: { cookie: maya.cookie, "x-csrf-token": maya.csrf },
      payload: { tool: "get_chronosphere_trace" },
    });
    const deniedForPayg = await app.inject({
      method: "POST",
      url: "/api/access/tools/check",
      headers: { cookie: priya.cookie, "x-csrf-token": priya.csrf },
      payload: { tool: "get_chronosphere_trace" },
    });
    const applyDenied = await app.inject({
      method: "POST",
      url: "/api/access/tools/check",
      headers: { cookie: maya.cookie, "x-csrf-token": maya.csrf },
      payload: { tool: "apply_credit" },
    });
    const applyAllowed = await app.inject({
      method: "POST",
      url: "/api/access/tools/check",
      headers: { cookie: jordan.cookie, "x-csrf-token": jordan.csrf },
      payload: { tool: "apply_credit" },
    });
    const destructive = await app.inject({
      method: "POST",
      url: "/api/access/tools/check",
      headers: { cookie: jordan.cookie, "x-csrf-token": jordan.csrf },
      payload: { tool: "delete_call_records" },
    });

    expect(allowed.json()).toMatchObject({ allowed: true, executed: false, enforcedBy: "api_role_gate", agntid: "UNCONFIGURED" });
    expect(deniedForPayg.json()).toMatchObject({ allowed: false, executed: false, agntid: "UNCONFIGURED" });
    expect(applyDenied.json().allowed).toBe(false);
    expect(applyAllowed.json().allowed).toBe(true);
    expect(destructive.json()).toMatchObject({ allowed: false, executed: false, enforcedBy: "api_role_gate" });
    expect(JSON.stringify(destructive.json())).not.toContain("providerDecisionId");
  });

  it("lets a senior allow a refund and blocks a line engineer", async () => {
    const desk = await buildServer({
      repo: new InMemorySupportOpsRepository(),
      sessionSecret: SESSION_SECRET,
      webOrigin: "http://localhost:3000",
      demoMode: true,
      logger: false,
    });
    const priya = await login(desk, "priya.nair@supportops.demo");
    const jordanSession = await login(desk, "jordan.hale@supportops.demo");

    const outside = await desk.inject({
      method: "POST",
      url: `/api/desk/refunds/${IDS.refundAna}/decision`,
      headers: { cookie: priya.cookie, "x-csrf-token": priya.csrf },
      payload: { decision: "allow" },
    });
    expect(outside.statusCode).toBe(403);
    expect(outside.json().error.code).toBe("FORBIDDEN");

    const denied = await desk.inject({
      method: "POST",
      url: `/api/desk/refunds/${IDS.refundMia}/decision`,
      headers: { cookie: priya.cookie, "x-csrf-token": priya.csrf },
      payload: { decision: "deny" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ROLE_FORBIDDEN");

    const allowed = await desk.inject({
      method: "POST",
      url: `/api/desk/refunds/${IDS.refundMia}/decision`,
      headers: { cookie: jordanSession.cookie, "x-csrf-token": jordanSession.csrf },
      payload: { decision: "allow" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().refund.status).toBe("ALLOWED");

    const credit = await desk.inject({
      method: "POST",
      url: "/api/desk/credits",
      headers: { cookie: jordanSession.cookie, "x-csrf-token": jordanSession.csrf },
      payload: { customerId: IDS.cusMia, amountCents: 100, direction: "give", reason: "Courtesy credit" },
    });
    expect(credit.statusCode).toBe(200);
    expect(credit.json().entry.amountCents).toBe(100);

    const returned = await desk.inject({
      method: "POST",
      url: "/api/desk/payments",
      headers: { cookie: jordanSession.cookie, "x-csrf-token": jordanSession.csrf },
      payload: { refundId: IDS.refundMia },
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json().payment.provider).toBe("mock_card");
    expect(returned.json().replayed).toBe(false);
    await desk.close();
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
