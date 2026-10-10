"use client";
import type { IntegrationStatus, SupportCase } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AuditTable } from "@/components/audit-table";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  Field,
  Notice,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
type Health = {
  status: "ok";
  database: "ok" | "unavailable";
  agntid: IntegrationStatus;
  demoMode: boolean;
};
export default function SecurityPage() {
  const [caseId, setCaseId] = useState("");
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api<Health>("/health"),
  });
  const cases = useQuery({
    queryKey: ["cases", "security"],
    queryFn: () => api<{ cases: SupportCase[] }>("/api/cases"),
  });
  const selected = caseId || cases.data?.cases[0]?.id || "";
  return (
    <div className="page">
      <PageHeader
        title="Security & execution audit"
        description="Trace what ran, what was blocked, and which system enforced it."
      />
      <Notice>
        AgntID is {health.data?.agntid.toLowerCase() ?? "unconfigured"}. Backend
        execution and provider authorization are separate. Unconfigured provider
        records have no decision IDs.
      </Notice>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={health.data?.database === "ok" ? "success" : "warning"}>
          Database · {health.data?.database ?? "Checking"}
        </Badge>
        <Badge>
          Demo mode ·{" "}
          {health.data ? (health.data.demoMode ? "On" : "Off") : "Checking"}
        </Badge>
        <StatusBadge value={health.data?.agntid ?? "UNCONFIGURED"} />
      </div>
      <QueryError
        error={health.error ?? cases.error}
        retry={() => {
          void health.refetch();
          void cases.refetch();
        }}
      />
      <div className="max-w-[720px]">
        <Field label="Case">
          <select
            value={selected}
            disabled={cases.isPending}
            onChange={(e) => setCaseId(e.target.value)}
          >
            <option value="" disabled>
              Choose an assigned case
            </option>
            {cases.data?.cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · {c.orgName}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {selected ? (
        <AuditTable caseId={selected} />
      ) : (
        cases.isSuccess && (
          <EmptyState
            title="No assigned cases"
            description="There are no cases available to audit in this session."
          />
        )
      )}
    </div>
  );
}
