import type { User } from "@supportops/shared";
import type { SupportOpsRepository } from "../db/repository.js";
import { visibleOrgIds } from "./scope.js";

export async function listCasesForActor(repo: SupportOpsRepository, actor: User, orgId?: string) {
  const orgIds = await visibleOrgIds(repo, actor);
  if (orgId && !orgIds.includes(orgId)) {
    return { type: "forbidden" as const };
  }
  const scope = orgId ? [orgId] : orgIds;
  const cases = await repo.listCasesByOrgIds(scope);
  return { type: "ok" as const, cases };
}

export async function getCaseForActor(repo: SupportOpsRepository, actor: User, caseId: string) {
  const supportCase = await repo.findCaseById(caseId);
  if (!supportCase) return { type: "missing" as const };
  const orgIds = await visibleOrgIds(repo, actor);
  if (!orgIds.includes(supportCase.orgId)) return { type: "forbidden" as const };
  return { type: "ok" as const, supportCase };
}
