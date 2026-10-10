import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  callLogSchema,
  creditAdjustBodySchema,
  creditLedgerSchema,
  customerSchema,
  paymentReturnSchema,
  refundDecisionBodySchema,
  refundSchema,
  roleAllowsAction,
  subscriptionSchema,
  toolCheckBodySchema,
  toolCheckResponseSchema,
} from "@supportops/shared";
import type { createAuthGuards } from "../auth/guard.js";
import type { SupportOpsRepository } from "../db/repository.js";
import { sendError } from "../errors.js";
import { checkTool, customerForActor, listDesk, presentCustomer } from "../services/desk.js";
import { visibleOrgIds } from "../services/scope.js";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
type Guards = ReturnType<typeof createAuthGuards>;

export function registerDeskRoutes(app: FastifyInstance, repo: SupportOpsRepository, guards: Guards) {
  app.get("/api/desk/calls", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const result = await listDesk(repo, request.actor, "view_call_logs", (orgIds) => repo.listCallsByOrgIds(orgIds));
    if (result.type === "role_forbidden") {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "This role cannot view call logs.");
    }
    return reply.send({ calls: result.records.map((row) => callLogSchema.parse(row)) });
  });

  app.get("/api/desk/subscriptions", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const result = await listDesk(repo, request.actor, "view_subscriptions", (orgIds) =>
      repo.listSubscriptionsByOrgIds(orgIds),
    );
    if (result.type === "role_forbidden") {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "This role cannot view subscriptions.");
    }
    return reply.send({ subscriptions: result.records.map((row) => subscriptionSchema.parse(row)) });
  });

  app.get("/api/desk/customers", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const actor = request.actor;
    const result = await listDesk(repo, actor, "view_customer_profile", (orgIds) => repo.listCustomersByOrgIds(orgIds));
    if (result.type === "role_forbidden") {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "This role cannot view customers.");
    }
    return reply.send({
      customers: result.records.map((row) => presentCustomer(row, actor)),
    });
  });

  app.get("/api/desk/customers/:customerId", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const params = z.object({ customerId: idSchema }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "customerId must be a short identifier.");
    const result = await customerForActor(repo, request.actor, params.data.customerId);
    if (result.type === "missing") return sendError(reply, request, 404, "NOT_FOUND", "Customer not found.");
    if (result.type === "forbidden") {
      return sendError(reply, request, 403, "FORBIDDEN", "This session cannot see that customer's organization.");
    }
    if (result.type === "role_forbidden") {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "This role cannot view customers.");
    }
    return reply.send({ customer: customerSchema.parse(result.customer) });
  });

  app.get("/api/desk/refunds", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const orgIds = await visibleOrgIds(repo, request.actor);
    const refunds = await repo.listRefundsByOrgIds(orgIds);
    return reply.send({ refunds: refunds.map((row) => refundSchema.parse(row)) });
  });

  app.post(
    "/api/desk/refunds/:refundId/decision",
    { preHandler: guards.requireActorAndCsrf },
    async (request, reply) => {
      if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
      const params = z.object({ refundId: idSchema }).safeParse(request.params);
      const body = refundDecisionBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return sendError(reply, request, 400, "VALIDATION_ERROR", "decision must be allow or deny.");
      }
      const refund = await repo.findRefundById(params.data.refundId);
      if (!refund) return sendError(reply, request, 404, "NOT_FOUND", "Refund request not found.");
      const orgIds = await visibleOrgIds(repo, request.actor);
      if (!orgIds.includes(refund.orgId)) {
        return sendError(reply, request, 403, "FORBIDDEN", "This session cannot decide a refund outside its organizations.");
      }
      if (!roleAllowsAction(request.actor.role, "decide_refund")) {
        return sendError(reply, request, 403, "ROLE_FORBIDDEN", "Only a senior CSE can allow or deny a refund.");
      }
      const decided = await repo.decideRefund({
        refundId: refund.id,
        decision: body.data.decision,
        actorUserId: request.actor.id,
        actorName: request.actor.displayName,
      });
      if (decided.type === "missing") return sendError(reply, request, 404, "NOT_FOUND", "Refund request not found.");
      if (decided.type === "conflict") {
        return sendError(reply, request, 409, "CONFLICT", "This refund request is no longer pending.");
      }
      return reply.send({ refund: refundSchema.parse(decided.refund) });
    },
  );

  app.get("/api/desk/credits", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const orgIds = await visibleOrgIds(repo, request.actor);
    const credits = await repo.listCreditsByOrgIds(orgIds);
    return reply.send({ credits: credits.map((row) => creditLedgerSchema.parse(row)) });
  });

  app.post("/api/desk/credits", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const body = creditAdjustBodySchema.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "Provide a customer, a positive amount, and a reason.");
    }
    const customer = await repo.findCustomerById(body.data.customerId);
    if (!customer) return sendError(reply, request, 404, "NOT_FOUND", "Customer not found.");
    const orgIds = await visibleOrgIds(repo, request.actor);
    if (!orgIds.includes(customer.orgId)) {
      return sendError(reply, request, 403, "FORBIDDEN", "This session cannot adjust credit outside its organizations.");
    }
    if (!roleAllowsAction(request.actor.role, "adjust_credit")) {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "Only a senior CSE can give or reduce credits.");
    }
    const signed = body.data.direction === "give" ? body.data.amountCents : -body.data.amountCents;
    const adjusted = await repo.adjustCredit({
      customerId: customer.id,
      amountCents: signed,
      reason: body.data.reason,
      actorUserId: request.actor.id,
    });
    if (adjusted.type === "missing") return sendError(reply, request, 404, "NOT_FOUND", "Customer not found.");
    if (adjusted.type === "insufficient") {
      return sendError(reply, request, 400, "VALIDATION_ERROR", "Credit balance cannot go negative.");
    }
    return reply.send({ entry: creditLedgerSchema.parse(adjusted.entry) });
  });

  app.get("/api/desk/payments", { preHandler: guards.requireActor }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    if (!roleAllowsAction(request.actor.role, "return_payment")) {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "Only a senior CSE can view payment returns.");
    }
    const orgIds = await visibleOrgIds(repo, request.actor);
    const payments = await repo.listPaymentReturnsByOrgIds(orgIds);
    return reply.send({ payments: payments.map((row) => paymentReturnSchema.parse(row)) });
  });

  app.post("/api/desk/payments", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const body = z.object({ refundId: idSchema }).strict().safeParse(request.body);
    if (!body.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "refundId is required.");
    const refund = await repo.findRefundById(body.data.refundId);
    if (!refund) return sendError(reply, request, 404, "NOT_FOUND", "Refund request not found.");
    const orgIds = await visibleOrgIds(repo, request.actor);
    if (!orgIds.includes(refund.orgId)) {
      return sendError(reply, request, 403, "FORBIDDEN", "This session cannot return a payment outside its organizations.");
    }
    if (!roleAllowsAction(request.actor.role, "return_payment")) {
      return sendError(reply, request, 403, "ROLE_FORBIDDEN", "Only a senior CSE can return money to the mock payment provider.");
    }
    const returned = await repo.returnPayment({
      refundId: refund.id,
      actorUserId: request.actor.id,
      actorName: request.actor.displayName,
    });
    if (returned.type === "missing") return sendError(reply, request, 404, "NOT_FOUND", "Refund request not found.");
    if (returned.type === "not_allowed") {
      return sendError(reply, request, 409, "CONFLICT", "Only an allowed refund can be returned to the payment provider.");
    }
    return reply.send({
      payment: paymentReturnSchema.parse(returned.payment),
      replayed: returned.replayed,
    });
  });

  app.post("/api/access/tools/check", { preHandler: guards.requireActorAndCsrf }, async (request, reply) => {
    if (!request.actor) return sendError(reply, request, 401, "UNAUTHENTICATED", "Sign in with a demo identity.");
    const body = toolCheckBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, request, 400, "VALIDATION_ERROR", "tool is required.");
    return reply.send(toolCheckResponseSchema.parse(checkTool(request.actor, body.data.tool)));
  });
}
