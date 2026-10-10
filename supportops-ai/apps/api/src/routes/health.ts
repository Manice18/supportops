import type { FastifyInstance } from "fastify";
import { healthResponseSchema, type AuthorizationGateway } from "@supportops/shared";
import type { SupportOpsRepository } from "../db/repository.js";

export function registerHealthRoute(
  app: FastifyInstance,
  repo: SupportOpsRepository,
  authorization: AuthorizationGateway,
  demoMode: boolean,
) {
  app.get("/health", async (_request, reply) => {
    let database: "ok" | "unavailable" = "unavailable";
    try {
      database = (await repo.ping()) ? "ok" : "unavailable";
    } catch {
      database = "unavailable";
    }
    const body = healthResponseSchema.parse({
      status: "ok",
      service: "supportops-api",
      demoMode,
      database,
      agntid: authorization.integration,
    });
    return reply.send(body);
  });
}
