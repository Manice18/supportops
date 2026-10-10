import {
  customerSchema,
  isKnownTool,
  roleAllowsAction,
  roleAllowsTool,
  type CustomerRecord,
  type DashboardAction,
  type User,
} from "@supportops/shared";
import type { CustomerSource, SupportOpsRepository } from "../db/repository.js";
import { visibleOrgIds } from "./scope.js";

export function presentCustomer(source: CustomerSource, actor: User): CustomerRecord {
  const billing = roleAllowsAction(actor.role, "view_customer_billing");
  return customerSchema.parse({
    id: source.id,
    orgId: source.orgId,
    orgName: source.orgName,
    displayName: source.displayName,
    plan: source.plan,
    region: source.region,
    status: source.status,
    email: billing ? source.email : null,
    paymentBrand: billing ? source.paymentBrand : null,
    paymentLast4: billing ? source.paymentLast4 : null,
    creditBalanceCents: source.creditBalanceCents,
  });
}

async function orgScope(repo: SupportOpsRepository, actor: User, orgId: string) {
  const orgIds = await visibleOrgIds(repo, actor);
  return orgIds.includes(orgId);
}

export async function listDesk<T>(
  repo: SupportOpsRepository,
  actor: User,
  action: DashboardAction,
  load: (orgIds: string[]) => Promise<T[]>,
) {
  if (!roleAllowsAction(actor.role, action)) return { type: "role_forbidden" as const };
  const orgIds = await visibleOrgIds(repo, actor);
  return { type: "ok" as const, records: await load(orgIds) };
}

export async function customerForActor(repo: SupportOpsRepository, actor: User, customerId: string) {
  if (!roleAllowsAction(actor.role, "view_customer_profile")) return { type: "role_forbidden" as const };
  const customer = await repo.findCustomerById(customerId);
  if (!customer) return { type: "missing" as const };
  if (!(await orgScope(repo, actor, customer.orgId))) return { type: "forbidden" as const };
  return { type: "ok" as const, customer: presentCustomer(customer, actor) };
}

export function checkTool(actor: User, tool: string) {
  if (!isKnownTool(tool) || !roleAllowsTool(actor.role, tool)) {
    return {
      tool,
      allowed: false,
      executed: false as const,
      enforcedBy: "api_role_gate" as const,
      agntid: "UNCONFIGURED" as const,
      reason: isKnownTool(tool)
        ? "This role cannot call that tool."
        : "Unknown tool. The role gate denies it.",
    };
  }
  return {
    tool,
    allowed: true,
    executed: false as const,
    enforcedBy: "api_role_gate" as const,
    agntid: "UNCONFIGURED" as const,
    reason: "The role gate allows this tool. This check does not execute it. AgntID is not connected.",
  };
}
