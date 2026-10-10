import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { MemoryInvestigationStore, type InvestigationStore } from "@supportops/investigation";
import type { AuthorizationGateway } from "@supportops/shared";
import { UnconfiguredAuthorizationGateway } from "./adapters/authorization/unconfigured-gateway.js";
import { createAuthGuards } from "./auth/guard.js";
import "./auth/types.js";
import type { SupportOpsRepository } from "./db/repository.js";
import { sendError } from "./errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCaseRoutes } from "./routes/cases.js";
import { registerDeskRoutes } from "./routes/desk.js";
import { registerDemoRoutes } from "./routes/demo.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerInvestigationRoutes } from "./routes/investigation.js";

const AUTHORITY_FIELDS = new Set(["actor_id", "actorId", "actorUserId", "role", "isAdmin", "is_admin"]);

export type BuildServerOptions = {
  repo: SupportOpsRepository;
  sessionSecret: string;
  webOrigin: string;
  demoMode: boolean;
  authorization?: AuthorizationGateway;
  investigations?: InvestigationStore;
  loginRateLimit?: number;
  logger?: boolean;
};

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const authorization = options.authorization ?? new UnconfiguredAuthorizationGateway();
  const app = Fastify({
    logger: options.logger === false ? false : loggerOptions(),
    bodyLimit: 64 * 1024,
    genReqId: (request) => {
      const incoming = request.headers["x-correlation-id"];
      return typeof incoming === "string" && /^[\w-]{8,80}$/.test(incoming) ? incoming : randomUUID();
    },
  });

  await app.register(cookie, { secret: options.sessionSecret });
  await app.register(cors, {
    origin: options.webOrigin,
    credentials: true,
    allowedHeaders: ["content-type", "x-csrf-token", "x-correlation-id"],
    exposedHeaders: ["x-correlation-id"],
  });
  await app.register(rateLimit, { global: false });

  app.decorateRequest("correlationId", "");
  app.decorateRequest("actor", null);
  app.decorateRequest("session", null);

  app.addHook("onRequest", async (request, reply) => {
    request.correlationId = request.id;
    reply.header("x-correlation-id", request.correlationId);
  });

  app.addHook("preValidation", async (request, reply) => {
    if (!request.url.startsWith("/api")) return;
    const field = findAuthorityField(request.query) ?? findAuthorityField(request.body);
    if (!field) return;
    return sendError(
      reply,
      request,
      400,
      "AUTHORITY_FIELD_REJECTED",
      `The field "${field}" cannot be supplied by the client. Identity comes from the demo session.`,
    );
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (status === 429) {
      return sendError(reply, request, 429, "RATE_LIMITED", "Too many requests. Wait a moment and try again.");
    }
    if (status >= 500) {
      request.log.error({ err: error }, "request failed");
      return sendError(reply, request, 500, "INTERNAL_ERROR", "Something went wrong.");
    }
    return sendError(reply, request, status, "VALIDATION_ERROR", "Request could not be processed.");
  });

  const guards = createAuthGuards(options.repo, options.sessionSecret);
  registerHealthRoute(app, options.repo, authorization, options.demoMode);
  registerAuthRoutes(app, options.repo, guards, options.sessionSecret, options.loginRateLimit ?? 20);
  registerCaseRoutes(app, options.repo, guards);
  registerDeskRoutes(app, options.repo, guards);
  registerDemoRoutes(app, guards, authorization, options.demoMode);
  registerInvestigationRoutes(
    app,
    options.repo,
    guards,
    options.investigations ?? new MemoryInvestigationStore(),
    authorization,
  );

  return app;
}

export function apiLogFile(): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return process.env.API_LOG_FILE ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../logs/api.log");
}

function loggerOptions() {
  const destination = apiLogFile();
  if (destination) mkdirSync(dirname(destination), { recursive: true });
  return {
    redact: {
      paths: ["req.headers.cookie", "req.headers.authorization", "res.headers.set-cookie"],
      remove: true,
    },
    transport: destination
      ? {
          target: "pino/file",
          options: { destination, mkdir: true },
        }
      : undefined,
  };
}

function findAuthorityField(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const key of Object.keys(value)) {
    if (AUTHORITY_FIELDS.has(key)) return key;
  }
  return null;
}
