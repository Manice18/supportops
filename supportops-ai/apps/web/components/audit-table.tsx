"use client";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  EmptyState,
  humanize,
  Loading,
  QueryError,
  StatusBadge,
} from "./ui/page";
import { Badge } from "./ui/badge";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/utils";
type AuditRow = {
  tool?: string;
  action?: string;
  agntid?: string;
  authorizationStatus?: string;
  executed?: boolean;
  backend?: string;
  outcome?: string;
  createdAt?: string;
  timestamp?: string;
};
const reason = (code?: string) =>
  code === "BACKEND_EXECUTED_AGNTID_UNCONFIGURED"
    ? "Succeeded · Role gate allowed"
    : code === "BACKEND_DENIED"
      ? "Denied · Restricted tool"
      : code === "ROLE_FORBIDDEN"
        ? "Denied · Role restriction"
        : code === "BACKEND_ORG_MISMATCH"
          ? "Denied · Organization mismatch"
          : code
            ? humanize(code)
            : "—";
export function AuditTable({ caseId }: { caseId: string }) {
  const query = useQuery({
    queryKey: ["audit", caseId],
    queryFn: () =>
      api<{ agntid: string; attempts: AuditRow[]; audit: AuditRow[] }>(
        "/api/audit?caseId=" + encodeURIComponent(caseId),
      ),
    enabled: !!caseId,
  });
  if (!caseId) return null;
  return (
    <div className="space-y-6">
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading label="Loading case audit…" />
      ) : (
        !query.error &&
        (query.data?.attempts.length ? (
          <DataTable
            label="Tool execution audit"
            headers={[
              "Tool",
              "Provider status",
              "Executed",
              "Backend result",
              "Time (UTC)",
            ]}
            minWidth={1000}
          >
            {query.data.attempts.map((a, i) => (
              <tr key={a.tool + "-" + i}>
                <td>{a.tool}</td>
                <td>
                  <StatusBadge value={a.authorizationStatus ?? "UNAVAILABLE"} />
                </td>
                <td>
                  <Badge variant={a.executed ? "success" : "danger"}>
                    {a.executed ? "Yes" : "No"}
                  </Badge>
                </td>
                <td>{reason(a.backend)}</td>
                <td className="whitespace-nowrap">
                  {a.createdAt ? formatWhen(a.createdAt) : "—"}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No tool attempts yet"
            description="Run an investigation or check a case tool to populate the audit."
          />
        ))
      )}
      {!!query.data?.audit.length && (
        <>
          <h2 className="section-title">Case actions</h2>
          <DataTable
            label="Case action history"
            headers={["Action", "Outcome", "Time (UTC)"]}
          >
            {query.data.audit.map((a, i) => (
              <tr key={i}>
                <td>{humanize(a.action ?? "Action")}</td>
                <td>{humanize(a.outcome ?? "Recorded")}</td>
                <td>{a.timestamp ? formatWhen(a.timestamp) : "—"}</td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </div>
  );
}
