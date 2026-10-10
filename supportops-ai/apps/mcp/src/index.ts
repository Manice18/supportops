import { timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPrismaClient } from "@supportops/db";
import { PrismaInvestigationStore } from "@supportops/investigation";
import { FLAGSHIP_WINDOW, orgPlanVisibleToRole, roleAllowsTool, userRoleSchema, type UserRole } from "@supportops/shared";
import { jwtVerify } from "jose";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../.env") });

const port = Number(process.env.MCP_PORT ?? 4050);
const logFile = process.env.MCP_LOG_FILE ?? resolve(here, "../../../logs/mcp.log");
mkdirSync(dirname(logFile), { recursive: true });
const secret = process.env.SESSION_SECRET;
const mcpAuthToken = process.env.MCP_AUTH_TOKEN;
if (!secret || secret.length < 16) {
  throw new Error("SESSION_SECRET is required before the MCP server can verify demo tokens.");
}

const prisma = createPrismaClient();
const store = new PrismaInvestigationStore(prisma);

const tokens = new AsyncLocalStorage<string | undefined>();

function createMcpServer() {
  const mcp = new McpServer({ name: "supportops", version: "0.4.0" });
  registerTools(mcp);
  return mcp;
}

function registerTools(server: McpServer) {
  server.registerTool(
  "search_axiom_logs",
  {
    description: "Search incident logs for an organization the signed-in engineer can see.",
    inputSchema: z.object({
      orgId: z.string(),
      start: z.string().datetime(),
      end: z.string().datetime(),
      severity: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }),
  },
  async (args) => {
    const actor = await actorFrom(tokens.getStore());
    if (!actor) return denied("Sign in with a SupportOps access token.");
    if (!roleAllowsTool(actor.role, "search_axiom_logs")) return denied("This role cannot search logs.");
    if (!(await canSeeOrg(actor.id, actor.role, args.orgId))) return denied("This token cannot read that organization.");
    const page = await store.searchLogs(args);
    return text({ items: page.items });
  },
);

server.registerTool(
  "get_billing_entries",
  {
    description: "Read billed call entries for call ids in an assigned organization.",
    inputSchema: z.object({
      orgId: z.string(),
      callIds: z.array(z.string()).max(80),
    }),
  },
  async (args) => {
    const actor = await actorFrom(tokens.getStore());
    if (!actor) return denied("Sign in with a SupportOps access token.");
    if (!roleAllowsTool(actor.role, "get_billing_entries")) return denied("This role cannot read billing.");
    if (!(await canSeeOrg(actor.id, actor.role, args.orgId))) return denied("This token cannot read that organization.");
    return text({ entries: await store.getBilling(args.orgId, args.callIds) });
  },
);

server.registerTool(
  "set_feature_flag",
  {
    description: "Set a feature flag. AgntID policy decides whether this call is allowed before it reaches this handler.",
    inputSchema: z.object({
      orgId: z.string(),
      flagKey: z.string(),
      enabled: z.string().describe("true or false"),
    }),
  },
  async (args) => {
    const actor = await actorFrom(tokens.getStore());
    if (!actor) return denied("Sign in with a SupportOps access token.");
    const enabled = args.enabled === "true";
    if (args.enabled !== "true" && args.enabled !== "false") {
      return denied("enabled must be the text true or false.");
    }
    const flag = await store.setFeatureFlag(args.orgId, args.flagKey, enabled);
    return text({ executed: true, flag });
  },
);

  server.registerTool(
    "get_support_case",
    {
      description: "Read one support case. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string(), caseId: z.string() }),
    },
    async (args) => {
      if (!(await actorFrom(tokens.getStore()))) return denied("Sign in with a SupportOps access token.");
      const row = await prisma.supportCase.findFirst({ where: { id: args.caseId, orgId: args.orgId } });
      return text({ case: row ? { id: row.id, orgId: row.orgId, title: row.title, status: row.status } : null });
    },
  );

  server.registerTool(
    "get_clickhouse_events",
    {
      description: "Read request events for an organization. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({
        orgId: z.string(),
        start: z.string().datetime(),
        end: z.string().datetime(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    async (args) => {
      if (!(await actorFrom(tokens.getStore()))) return denied("Sign in with a SupportOps access token.");
      const page = await store.getCallEvents(args);
      return text({ items: page.items });
    },
  );

  server.registerTool(
    "get_chronosphere_trace",
    {
      description: "Read trace spans for an organization. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string(), traceId: z.string() }),
    },
    async (args) => {
      if (!(await actorFrom(tokens.getStore()))) return denied("Sign in with a SupportOps access token.");
      return text({ spans: await store.getTrace(args.orgId, args.traceId) });
    },
  );

  server.registerTool(
    "get_service_metrics",
    {
      description: "Read aggregate service metrics. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({
        orgId: z.string(),
        region: z.string(),
        service: z.string(),
        metricName: z.string(),
        start: z.string().datetime(),
        end: z.string().datetime(),
      }),
    },
    async (args) => {
      if (!(await actorFrom(tokens.getStore()))) return denied("Sign in with a SupportOps access token.");
      return text({
        samples: await store.getMetrics({
          region: args.region,
          service: args.service,
          metricName: args.metricName,
          start: args.start,
          end: args.end,
        }),
      });
    },
  );

  server.registerTool(
    "get_posthog_flags",
    {
      description: "Read feature flags for an organization. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string() }),
    },
    async (args) => {
      if (!(await actorFrom(tokens.getStore()))) return denied("Sign in with a SupportOps access token.");
      return text({ flags: await store.getFlags(args.orgId) });
    },
  );

  server.registerTool(
    "calculate_eligible_credit",
    {
      description: "Calculate the eligible credit from posted charges. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string() }),
    },
    async (args) => {
      if (!(await actorFrom(tokens.getStore()))) return denied("Sign in with a SupportOps access token.");
      const report = await store.evidence(args.orgId, false, false);
      return text({
        eligibleAmountCents: report.eligibleAmountCents,
        safeAmountCents: report.safeAmountCents,
        failedCallCount: report.failedCallCount,
      });
    },
  );

  server.registerTool(
    "propose_credit",
    {
      description: "Record a proposed credit. kind is the text safe or eligible. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string(), caseId: z.string(), kind: z.string() }),
    },
    async (args) => {
      const actor = await actorFrom(tokens.getStore());
      if (!actor) return denied("Sign in with a SupportOps access token.");
      if (args.kind !== "safe" && args.kind !== "eligible") return denied("kind must be the text safe or eligible.");
      const proposed = await store.proposeCredit({
        orgId: args.orgId,
        caseId: args.caseId,
        kind: args.kind,
        actorUserId: actor.id,
      });
      return text(proposed);
    },
  );

  server.registerTool(
    "apply_credit",
    {
      description: "Apply a proposed credit. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string(), caseId: z.string(), idempotencyKey: z.string() }),
    },
    async (args) => {
      const actor = await actorFrom(tokens.getStore());
      if (!actor) return denied("Sign in with a SupportOps access token.");
      return text(
        await store.applyCredit({
          orgId: args.orgId,
          caseId: args.caseId,
          idempotencyKey: args.idempotencyKey,
          actorUserId: actor.id,
        }),
      );
    },
  );

  server.registerTool(
    "create_escalation",
    {
      description: "Ask a senior to review a credit. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string(), caseId: z.string(), amountCents: z.number().int(), reason: z.string() }),
    },
    async (args) => {
      const actor = await actorFrom(tokens.getStore());
      if (!actor) return denied("Sign in with a SupportOps access token.");
      return text({
        approval: await store.escalate({
          orgId: args.orgId,
          caseId: args.caseId,
          amountCents: args.amountCents,
          reason: args.reason,
          actorUserId: actor.id,
        }),
      });
    },
  );

  server.registerTool(
    "update_org_config",
    {
      description: "Change an organization setting. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string(), configKey: z.string(), configValue: z.string() }),
    },
    async (args) => {
      const actor = await actorFrom(tokens.getStore());
      if (!actor) return denied("Sign in with a SupportOps access token.");
      await store.recordAudit({
        actorUserId: actor.id,
        orgId: args.orgId,
        supportCaseId: "case_flagship_47",
        action: "update_org_config",
        outcome: "applied",
        sanitizedPayload: { configKey: args.configKey, configValue: args.configValue },
      });
      return text({ executed: true, configKey: args.configKey, configValue: args.configValue });
    },
  );

  server.registerTool(
    "delete_call_records",
    {
      description: "Delete call records for an organization. AgntID policy decides whether this call is allowed.",
      inputSchema: z.object({ orgId: z.string(), confirm: z.string().describe("yes or no") }),
    },
    async (args) => {
      const actor = await actorFrom(tokens.getStore());
      if (!actor) return denied("Sign in with a SupportOps access token.");
      if (args.confirm !== "yes") return text({ executed: true, deleted: 0 });
      const window = { gte: new Date(FLAGSHIP_WINDOW.start), lt: new Date(FLAGSHIP_WINDOW.end) };
      const matched = await prisma.call.count({ where: { orgId: args.orgId, startedAt: window } });
      await store.recordAudit({
        actorUserId: actor.id,
        orgId: args.orgId,
        supportCaseId: "case_flagship_47",
        action: "delete_call_records",
        outcome: "requested",
        sanitizedPayload: { matched },
      });
      return text({ executed: true, matched, deleted: 0 });
    },
  );
}

createServer((request, response) => {
  tokens.run(bearer(request.headers.authorization), () => {
    void handleMcp(request, response);
  });
}).listen(port, () => {
  logLine(`listening on ${port}`);
  console.log(`MCP logs: ${logFile}`);
});

async function handleMcp(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) {
  const mcp = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  response.on("finish", () => {
    logLine(`${request.method ?? "GET"} ${request.url ?? "/"} ${response.statusCode}`);
  });
  response.on("close", () => {
    void transport.close();
    void mcp.close();
  });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    logLine(`${request.method ?? "GET"} ${request.url ?? "/"} failed ${error instanceof Error ? error.message : "unknown error"}`);
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "text/plain" }).end("MCP request failed");
    }
  }
}

function logLine(line: string) {
  appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function denied(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ executed: false, agntid: "UNCONFIGURED", message }) }], isError: true };
}

function sameToken(left: string, right: string | undefined) {
  if (!right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearer(header: string | undefined) {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length);
}

async function actorFrom(token: string | undefined) {
  if (!token) return null;
  if (sameToken(token, mcpAuthToken)) {
    const user = await prisma.user.findUnique({ where: { id: "user_jordan" } });
    const role = userRoleSchema.safeParse(user?.role);
    if (!user || !role.success) return null;
    return { id: user.id, role: role.data };
  }
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "supportops-demo" });
    const role = userRoleSchema.safeParse(verified.payload.role);
    if (!role.success || typeof verified.payload.sub !== "string") return null;
    const user = await prisma.user.findUnique({ where: { id: verified.payload.sub } });
    if (!user || user.role !== role.data) return null;
    return { id: user.id, role: role.data };
  } catch {
    return null;
  }
}

async function canSeeOrg(userId: string, role: UserRole, orgId: string) {
  const access = await prisma.userOrganizationAccess.findFirst({ where: { userId, orgId }, include: { organization: true } });
  return Boolean(access && orgPlanVisibleToRole(role, access.organization.plan));
}
