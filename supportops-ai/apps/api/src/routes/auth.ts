import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { demoLoginBodySchema, meResponseSchema, organizationListSchema, type User } from "@supportops/shared";
import type { createAuthGuards } from "../auth/guard.js";
import { clearSession, issueSession, revokeSession, TOKEN_ISSUER, type VerifiedSession } from "../auth/session.js";
import type { SupportOpsRepository } from "../db/repository.js";
import { sendError } from "../errors.js";
import { accessProfile, organizationsForActor } from "../services/scope.js";

type Guards = ReturnType<typeof createAuthGuards>;

export function registerAuthRoutes(
  app: FastifyInstance,
  repo: SupportOpsRepository,
  guards: Guards,
  sessionSecret: string,
  loginRateLimit: number,
) {
  app.post(
    "/api/demo/login",
    {
      config: {
        rateLimit: {
          max: loginRateLimit,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = demoLoginBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, request, 400, "VALIDATION_ERROR", formatIssues(parsed.error));
      }
      const user = await repo.findUserByEmail(parsed.data.email.toLowerCase());
      if (!user) {
        return sendError(reply, request, 401, "UNAUTHENTICATED", "Unknown demo identity.");
      }
      const token = await issueSession(reply, sessionSecret, user);
      return reply.send(await buildMe(repo, user, token));
    },
  );

  app.post("/api/demo/logout", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    revokeSession(request);
    clearSession(reply);
    return reply.code(204).send();
  });

  app.get("/api/me", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    }
    if (!request.session) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    }
    return reply.send(await buildMe(repo, request.actor, sessionClaims(request.session)));
  });

  app.get("/api/organizations", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) {
      return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    }
    const organizations = await organizationsForActor(repo, request.actor);
    return reply.send(organizationListSchema.parse({ organizations }));
  });
}

function sessionClaims(session: VerifiedSession) {
  return {
    accessToken: session.accessToken,
    claims: {
      sub: session.sub,
      role: session.role,
      iss: TOKEN_ISSUER,
      exp: session.exp,
    },
  };
}

async function buildMe(
  repo: SupportOpsRepository,
  user: User,
  token: { accessToken: string; claims: { sub: string; role: User["role"]; iss: string; exp: number } },
) {
  const organizations = await organizationsForActor(repo, user);
  return meResponseSchema.parse({
    user,
    organizations,
    access: accessProfile(user),
    token,
  });
}

function formatIssues(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
}
