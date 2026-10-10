import type { FastifyReply, FastifyRequest } from "fastify";
import type { SupportOpsRepository } from "../db/repository.js";
import { sendError } from "../errors.js";
import { csrfMatches, readSession } from "./session.js";

export function createAuthGuards(repo: SupportOpsRepository, sessionSecret: string) {
  async function requireActor(request: FastifyRequest, reply: FastifyReply) {
    const session = await readSession(request, sessionSecret);
    if (!session) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    }
    const user = await repo.findUserById(session.sub);
    if (!user || user.role !== session.role) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "This demo session is no longer valid.");
    }
    request.actor = user;
    request.session = session;
    return undefined;
  }

  async function requireCsrf(request: FastifyRequest, reply: FastifyReply) {
    const session = request.session ?? (await readSession(request, sessionSecret));
    if (!session || !csrfMatches(request, session.csrf)) {
      return sendError(reply, request, 403, "CSRF_FAILED", "Missing or invalid CSRF token.");
    }
    return undefined;
  }

  async function requireActorAndCsrf(request: FastifyRequest, reply: FastifyReply) {
    const denied = await requireActor(request, reply);
    if (denied) return denied;
    return requireCsrf(request, reply);
  }

  return { requireActor, requireCsrf, requireActorAndCsrf };
}
