import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { caseListSchema, caseResponseSchema } from "@supportops/shared";
import type { createAuthGuards } from "../auth/guard.js";
import type { SupportOpsRepository } from "../db/repository.js";
import { sendError } from "../errors.js";
import { getCaseForActor, listCasesForActor } from "../services/cases.js";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const caseQuerySchema = z
  .object({
    orgId: idSchema.optional(),
  })
  .strict();

type Guards = ReturnType<typeof createAuthGuards>;

export function registerCaseRoutes(app: FastifyInstance, repo: SupportOpsRepository, guards: Guards) {
  app.get("/api/cases", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    }
    const query = caseQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "orgId must be a short identifier.");
    }
    const result = await listCasesForActor(repo, request.actor, query.data.orgId);
    if (result.type === "forbidden") {
      return sendError(reply, request, 403, "FORBIDDEN", "This session is not assigned to that organization.");
    }
    return reply.send(caseListSchema.parse({ cases: result.cases }));
  });

  app.get("/api/cases/:caseId", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    }
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
    return reply.send(caseResponseSchema.parse({ case: result.supportCase }));
  });
}
