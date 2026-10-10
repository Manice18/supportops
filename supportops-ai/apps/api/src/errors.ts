import type { FastifyReply, FastifyRequest } from "fastify";

type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "ROLE_FORBIDDEN"
  | "CONFLICT"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "AUTHORITY_FIELD_REJECTED"
  | "CSRF_FAILED"
  | "RATE_LIMITED"
  | "DEMO_DISABLED"
  | "NOT_IN_THIS_MILESTONE"
  | "INTERNAL_ERROR";

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: ApiErrorCode,
  message: string,
) {
  return reply.code(status).send({
    error: {
      code,
      message,
      correlationId: request.correlationId,
    },
  });
}
