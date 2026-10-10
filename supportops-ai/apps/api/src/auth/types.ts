import type { User } from "@supportops/shared";
import type { VerifiedSession } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
    actor: User | null;
    session: VerifiedSession | null;
  }
}

export {};
