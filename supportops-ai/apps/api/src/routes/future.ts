import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { createAuthGuards } from "../auth/guard.js";
import type { SupportOpsRepository } from "../db/repository.js";
import { sendError } from "../errors.js";
import { getCaseForActor } from "../services/cases.js";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
type Guards = ReturnType<typeof createAuthGuards>;

const NOT_READY = "This endpoint is reserved for a later milestone and does not execute.";

export function registerFutureRoutes(app: FastifyInstance, repo: SupportOpsRepository, guards: Guards) {
  async function requireCase(request: FastifyRequest, reply: FastifyReply) {
    const denied = await guards.requireActor(request, reply);
    if (denied || !request.actor) return denied;
    const params = z.object({ caseId: idSchema }).safeParse(request.params);
    if (!params.success) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "caseId must be a short identifier.");
    }
    const result = await getCaseForActor(repo, request.actor, params.data.caseId);
    if (result.type === "missing") {
      return sendError(reply, request, 404, "NOT_FOUND", "Case not found.");
    }
    if (result.type === "forbidden") {
      return sendError(reply, request, 403, "FORBIDDEN", "This session is not assigned to that organization's case.");
    }
    return undefined;
  }

  async function requireCaseWrite(request: FastifyRequest, reply: FastifyReply) {
    const denied = await requireCase(request, reply);
    if (denied) return denied;
    return guards.requireCsrf(request, reply);
  }

  const notReady = async (request: FastifyRequest, reply: FastifyReply) =>
    sendError(reply, request, 501, "NOT_IN_THIS_MILESTONE", NOT_READY);

  app.post("/api/cases/:caseId/investigations", { preHandler: requireCaseWrite }, notReady);
  app.get("/api/investigations/:id", { preHandler: guards.requireActor }, notReady);
  app.get("/api/investigations/:id/events", { preHandler: guards.requireActor }, notReady);
  app.post("/api/investigations/:id/messages", { preHandler: guards.requireActorAndCsrf }, notReady);
  app.post("/api/cases/:caseId/credits/propose", { preHandler: requireCaseWrite }, notReady);
  app.post("/api/cases/:caseId/credits/apply", { preHandler: requireCaseWrite }, notReady);
  app.post("/api/cases/:caseId/escalations", { preHandler: requireCaseWrite }, notReady);

  app.get("/api/audit", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    }
    const query = z.object({ caseId: idSchema }).strict().safeParse(request.query);
    if (!query.success) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "caseId is required.");
    }
    const result = await getCaseForActor(repo, request.actor, query.data.caseId);
    if (result.type === "missing") {
      return sendError(reply, request, 404, "NOT_FOUND", "Case not found.");
    }
    if (result.type === "forbidden") {
      return sendError(reply, request, 403, "FORBIDDEN", "This session is not assigned to that organization's case.");
    }
    return sendError(
      reply,
      request,
      501,
      "NOT_IN_THIS_MILESTONE",
      "Audit events are not recorded yet. No provider decision ids are available.",
    );
  });
}
