import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { createAuthGuards } from "../auth/guard.js";
import type { SupportOpsRepository } from "../db/repository.js";
import { sendError } from "../errors.js";
import { contextFor } from "../agent/context.js";
import { listPrompts, runMessage, runPrompt } from "../agent/run.js";
import { organizationsForActor } from "../services/scope.js";

type Guards = ReturnType<typeof createAuthGuards>;

export function registerAgentRoutes(app: FastifyInstance, repo: SupportOpsRepository, guards: Guards) {
  app.get("/api/agent/prompts", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    return reply.send({ prompts: listPrompts(request.actor.id) });
  });

  app.post("/api/agent/run", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const body = z
      .object({ promptId: z.string().min(1).max(80).optional(), message: z.string().min(1).max(2000).optional() })
      .strict()
      .safeParse(request.body);
    if (!body.success || (!body.data.promptId && !body.data.message)) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "Send a promptId or a message.");
    }
    try {
      const organizations = await organizationsForActor(repo, request.actor);
      const context = contextFor(organizations, body.data.message ?? body.data.promptId ?? "");
      if (body.data.promptId) {
        const turn = await runPrompt(request.actor, body.data.promptId, context);
        if (!turn) return sendError(reply, request, 404, "NOT_FOUND", "That prompt is not on this engineer's list.");
        return reply.send(turn);
      }
      return reply.send(await runMessage(request.actor, body.data.message!, context));
    } catch (error) {
      return sendError(
        reply,
        request,
        502,
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "The agent could not reach AgntID.",
      );
    }
  });
}
