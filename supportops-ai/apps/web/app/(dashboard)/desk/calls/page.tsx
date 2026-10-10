"use client";
import type { CallLog } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DeskNav } from "@/components/desk-nav";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Field,
  humanize,
  Loading,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/utils";
export default function CallsPage() {
  const [org, setOrg] = useState(""),
    [status, setStatus] = useState("");
  const calls = useQuery({
    queryKey: ["desk-calls"],
    queryFn: () => api<{ calls: CallLog[] }>("/api/desk/calls"),
  });
  const rows =
    calls.data?.calls.filter(
      (c) => (!org || c.orgId === org) && (!status || c.status === status),
    ) ?? [];
  const organizations = [
    ...new Map(calls.data?.calls.map((c) => [c.orgId, c.orgName])).entries(),
  ];
  return (
    <div className="page">
      <PageHeader
        title="Call logs"
        description="Call outcomes for your assigned organizations."
      />
      <DeskNav />
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <Field label="Organization">
          <select value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">All assigned</option>
            {organizations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Outcome">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All outcomes</option>
            <option value="FAILED">Failed</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In progress</option>
          </select>
        </Field>
      </div>
      <QueryError error={calls.error} retry={() => void calls.refetch()} />
      {calls.isPending ? (
        <Loading label="Loading call logs…" />
      ) : (
        !calls.error &&
        (rows.length ? (
          <DataTable
            label="Call logs"
            headers={[
              "Time (UTC)",
              "Customer",
              "Organization",
              "Status",
              "Failure",
            ]}
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">{formatWhen(c.startedAt)}</td>
                <td>{c.customerName}</td>
                <td>{c.orgName}</td>
                <td>
                  <StatusBadge value={c.status} />
                </td>
                <td className="text-muted-foreground">
                  {c.failureCategory ? humanize(c.failureCategory) : "—"}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            description="Clear filters to view calls in your assigned scope."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setOrg("");
                  setStatus("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ))
      )}
    </div>
  );
}
