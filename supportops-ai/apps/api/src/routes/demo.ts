import type { FastifyInstance } from "fastify";
import { demoScenarioListSchema } from "@supportops/shared";
import { demoScenarios } from "@supportops/mock-data";
import type { AuthorizationGateway } from "@supportops/shared";
import type { createAuthGuards } from "../auth/guard.js";
import { sendError } from "../errors.js";

type Guards = ReturnType<typeof createAuthGuards>;

export function registerDemoRoutes(
  app: FastifyInstance,
  guards: Guards,
  authorization: AuthorizationGateway,
  demoMode: boolean,
) {
  app.get("/api/demo/scenarios", { preHandler: guards.requireActor }, async (_request, reply) => {
    return reply.send(
      demoScenarioListSchema.parse({
        scenarios: demoScenarios,
        agntid: authorization.integration,
      }),
    );
  });

  app.post("/api/demo/reset", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    if (!demoMode || process.env.NODE_ENV === "production") {
      return sendError(reply, request, 403, "DEMO_DISABLED", "Demo reset is disabled outside local demo mode.");
    }
    return sendError(
      reply,
      request,
      501,
      "NOT_IN_THIS_MILESTONE",
      "Reset the local database with pnpm demo:reset. This HTTP route does not wipe data.",
    );
  });

  app.post("/api/demo/replay", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    if (!demoMode || process.env.NODE_ENV === "production") {
      return sendError(reply, request, 403, "DEMO_DISABLED", "Demo replay is disabled outside local demo mode.");
    }
    return sendError(
      reply,
      request,
      501,
      "NOT_IN_THIS_MILESTONE",
      "Isolated before/after replay is a later milestone. No ledger was changed.",
    );
  });
}
