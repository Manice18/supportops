import {
  actionsForRole,
  orgPlanVisibleToRole,
  segmentForRole,
  toolsForRole,
  type User,
} from "@supportops/shared";
import type { SupportOpsRepository } from "../db/repository.js";

export async function organizationsForActor(repo: SupportOpsRepository, actor: User) {
  const organizations = await repo.listOrganizations(actor.id);
  return organizations.filter((organization) => orgPlanVisibleToRole(actor.role, organization.plan));
}

export async function visibleOrgIds(repo: SupportOpsRepository, actor: User) {
  const organizations = await organizationsForActor(repo, actor);
  return organizations.map((organization) => organization.id);
}

export function accessProfile(actor: User) {
  return {
    segment: segmentForRole(actor.role),
    actions: actionsForRole(actor.role),
    tools: toolsForRole(actor.role),
  };
}
