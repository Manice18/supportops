import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { investigateCase, runTool, type InvestigationStore } from "@supportops/investigation";
import { investigationResultSchema, roleAllowsTool } from "@supportops/shared";
import type { AuthorizationGateway } from "@supportops/shared";
import type { createAuthGuards } from "../auth/guard.js";
import type { SupportOpsRepository } from "../db/repository.js";
import { sendError } from "../errors.js";
import { getCaseForActor } from "../services/cases.js";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
type Guards = ReturnType<typeof createAuthGuards>;

export function registerInvestigationRoutes(
  app: FastifyInstance,
  repo: SupportOpsRepository,
  guards: Guards,
  store: InvestigationStore,
  authorization: AuthorizationGateway,
) {
  async function loadCase(request: FastifyRequest, reply: FastifyReply, caseId: string) {
    if (!request.actor) {
      return { error: sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.") };
    }
    const result = await getCaseForActor(repo, request.actor, caseId);
    if (result.type === "missing") {
      return { error: sendError(reply, request, 404, "NOT_FOUND", "Case not found.") };
    }
    if (result.type === "forbidden") {
      return { error: sendError(reply, request, 403, "FORBIDDEN", "This session is not assigned to that organization's case.") };
    }
    return { supportCase: result.supportCase, actor: request.actor };
  }

  app.get("/api/cases/:caseId/evidence", { preHandler: guards.requireActor }, async (request, reply) => {
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "caseId must be a short identifier.");
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    const evidence = await store.evidence(
      loaded.supportCase.orgId,
      roleAllowsTool(loaded.actor.role, "get_service_metrics"),
      roleAllowsTool(loaded.actor.role, "get_posthog_flags"),
    );
    const credits = await store.listCredits(loaded.supportCase.id);
    return reply.send({ evidence, credits });
  });

  app.post("/api/cases/:caseId/investigations", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "caseId must be a short identifier.");
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    const run = await investigateCase({
      store,
      actor: loaded.actor,
      supportCase: loaded.supportCase,
      gateway: authorization,
      correlationId: request.correlationId,
    });
    const saved = await store.saveInvestigation({
      supportCaseId: loaded.supportCase.id,
      userId: loaded.actor.id,
      findings: run.findings,
      attempts: run.attempts,
    });
    return reply.send({ investigation: saved, findings: investigationResultSchema.parse(run.findings) });
  });

  app.get("/api/cases/:caseId/investigations", { preHandler: guards.requireActor }, async (request, reply) => {
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "caseId must be a short identifier.");
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    return reply.send({ investigations: await store.listInvestigations(loaded.supportCase.id) });
  });

  app.get("/api/investigations/:id", { preHandler: guards.requireActor }, async (request, reply) => {
    const params = z.object({ id: idSchema }).safeParse(request.params);
    if (!params.success || !request.actor) return sendError(reply, request, 400, "VALIDATION_ERROR", "id must be a short identifier.");
    const found = await store.getInvestigation(params.data.id);
    if (!found) return sendError(reply, request, 404, "NOT_FOUND", "Investigation not found.");
    const loaded = await loadCase(request, reply, found.investigation.supportCaseId);
    if ("error" in loaded) return loaded.error;
    return reply.send(found);
  });

  app.get("/api/investigations/:id/events", { preHandler: guards.requireActor }, async (request, reply) => {
    const params = z.object({ id: idSchema }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "id must be a short identifier.");
    const found = await store.getInvestigation(params.data.id);
    if (!found) return sendError(reply, request, 404, "NOT_FOUND", "Investigation not found.");
    const loaded = await loadCase(request, reply, found.investigation.supportCaseId);
    if ("error" in loaded) return loaded.error;
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    for (const attempt of found.attempts) {
      reply.raw.write(`data: ${JSON.stringify(publicAttempt(attempt))}\n\n`);
    }
    reply.raw.end();
    return reply;
  });

  app.post("/api/investigations/:id/messages", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    const params = z.object({ id: idSchema }).safeParse(request.params);
    const body = z.object({ message: z.string().min(1).max(2000) }).strict().safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "A message is required.");
    const found = await store.getInvestigation(params.data.id);
    if (!found || !request.actor) return sendError(reply, request, 404, "NOT_FOUND", "Investigation not found.");
    const loaded = await loadCase(request, reply, found.investigation.supportCaseId);
    if ("error" in loaded) return loaded.error;
    await store.recordAudit({
      actorUserId: request.actor.id,
      orgId: loaded.supportCase.orgId,
      supportCaseId: loaded.supportCase.id,
      action: "engineer_message",
      outcome: "recorded",
      sanitizedPayload: { length: body.data.message.length },
    });
    return reply.send({
      reply:
        "The message is stored as data. It cannot apply a credit, change a flag, or widen organization access. Use the confirmation controls for those actions.",
    });
  });

  app.post("/api/cases/:caseId/credits/propose", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "caseId must be a short identifier.");
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    const body = z.object({ kind: z.enum(["safe", "eligible"]).default("safe") }).strict().safeParse(request.body ?? {});
    if (!body.success) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "kind must be safe or eligible.");
    }
    if (!roleAllowsTool(loaded.actor.role, "propose_credit")) {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "This role cannot propose a credit.");
    }
    const proposed = await store.proposeCredit({
      orgId: loaded.supportCase.orgId,
      caseId: loaded.supportCase.id,
      kind: body.data.kind,
      actorUserId: loaded.actor.id,
    });
    if ("type" in proposed) return sendError(reply, request, 400, "VALIDATION_ERROR", "There is no remaining eligible credit.");
    return reply.send({ credit: proposed.credit, replayed: proposed.replayed, agntid: "UNCONFIGURED" });
  });

  app.post("/api/cases/:caseId/credits/apply", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    const body = z.object({ idempotencyKey: z.string().min(3).max(120) }).strict().safeParse(request.body);
    if (!params.success || !body.success || !request.actor) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "idempotencyKey is required.");
    }
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    if (!roleAllowsTool(loaded.actor.role, "apply_credit")) {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "Only a senior CSE can apply a credit.");
    }
    const applied = await store.applyCredit({
      orgId: loaded.supportCase.orgId,
      caseId: loaded.supportCase.id,
      idempotencyKey: body.data.idempotencyKey,
      actorUserId: loaded.actor.id,
    });
    if (applied.type === "missing") return sendError(reply, request, 404, "NOT_FOUND", "Proposed credit not found.");
    if (applied.type === "cap") {
      await store.recordAudit({
        actorUserId: loaded.actor.id,
        orgId: loaded.supportCase.orgId,
        supportCaseId: loaded.supportCase.id,
        action: "apply_credit",
        outcome: "backend_cap",
        sanitizedPayload: { agntid: "UNCONFIGURED", backend: "DENIED" },
      });
      return sendError(
        reply,
        request,
        409,
        "CONFLICT",
        "This amount is above the $50 backend cap. Approve the escalation before applying it. AgntID did not make this decision.",
      );
    }
    if (applied.type === "shortfall") {
      return sendError(reply, request, 409, "CONFLICT", "The remaining posted charges do not match this proposal.");
    }
    return reply.send({ credit: applied.credit, replayed: applied.replayed, agntid: "UNCONFIGURED", backend: "ALLOWED" });
  });

  app.post("/api/cases/:caseId/escalations", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    const body = z
      .object({ amountCents: z.number().int().positive(), reason: z.string().min(3).max(280) })
      .strict()
      .safeParse(request.body);
    if (!params.success || !body.success || !request.actor) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "amountCents and reason are required.");
    }
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    if (!roleAllowsTool(loaded.actor.role, "create_escalation")) {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "This role cannot escalate.");
    }
    const approval = await store.escalate({
      orgId: loaded.supportCase.orgId,
      caseId: loaded.supportCase.id,
      amountCents: body.data.amountCents,
      reason: body.data.reason,
      actorUserId: loaded.actor.id,
    });
    return reply.send({ approval, agntid: "UNCONFIGURED" });
  });

  app.post("/api/cases/:caseId/approvals/:approvalId", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    const params = z.object({ caseId: idSchema, approvalId: idSchema }).safeParse(request.params);
    const body = z.object({ decision: z.enum(["approve", "reject"]) }).strict().safeParse(request.body);
    if (!params.success || !body.success || !request.actor) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "decision must be approve or reject.");
    }
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    if (!roleAllowsTool(loaded.actor.role, "apply_credit")) {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "Only a senior CSE can review an escalation.");
    }
    const approval = await store.reviewApproval({
      orgId: loaded.supportCase.orgId,
      caseId: loaded.supportCase.id,
      approvalId: params.data.approvalId,
      decision: body.data.decision,
      actorUserId: loaded.actor.id,
    });
    if (!approval) return sendError(reply, request, 404, "NOT_FOUND", "Pending approval not found.");
    return reply.send({ approval, agntid: "UNCONFIGURED" });
  });

  app.post("/api/cases/:caseId/tools", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    const body = z
      .object({ tool: z.string().min(1).max(80), arguments: z.record(z.unknown()).default({}) })
      .strict()
      .safeParse(request.body);
    if (!params.success || !body.success || !request.actor) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "tool is required.");
    }
    const loaded = await loadCase(request, reply, params.data.caseId);
    if ("error" in loaded) return loaded.error;
    const ran = await runTool({
      store,
      actor: loaded.actor,
      supportCase: loaded.supportCase,
      gateway: authorization,
      correlationId: request.correlationId,
      tool: body.data.tool,
      arguments: body.data.arguments,
    });
    await store.saveInvestigation({
      supportCaseId: loaded.supportCase.id,
      userId: loaded.actor.id,
      findings: { tool: body.data.tool, agntid: "UNCONFIGURED" },
      attempts: [ran.attempt],
    });
    return reply.send(ran.outcome);
  });

  app.get("/api/audit", { preHandler: guards.requireActor }, async (request, reply) => {
    const query = z.object({ caseId: idSchema }).strict().safeParse(request.query);
    if (!query.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "caseId is required.");
    const loaded = await loadCase(request, reply, query.data.caseId);
    if ("error" in loaded) return loaded.error;
    const [audit, attempts] = await Promise.all([
      store.listAudit(loaded.supportCase.id),
      store.listAttempts(loaded.supportCase.id),
    ]);
    return reply.send({
      agntid: authorization.integration,
      audit,
      attempts: attempts.map(publicAttempt),
    });
  });
}

function publicAttempt(attempt: {
  toolName: string;
  authorizationStatus: string;
  executed: boolean;
  reasonCode: string;
  createdAt: string;
}) {
  return {
    tool: attempt.toolName,
    agntid: "UNCONFIGURED" as const,
    authorizationStatus: attempt.authorizationStatus,
    executed: attempt.executed,
    backend: attempt.reasonCode,
    createdAt: attempt.createdAt,
  };
}
