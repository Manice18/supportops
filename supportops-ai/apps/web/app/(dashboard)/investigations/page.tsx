"use client";
import type { Organization, SupportCase } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Field,
  Loading,
  Notice,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/utils";
export default function InvestigationsPage() {
  const [orgId, setOrgId] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<{ organizations: Organization[] }>("/api/organizations"),
  });
  const cases = useQuery({
    queryKey: ["cases", orgId],
    queryFn: () =>
      api<{ cases: SupportCase[] }>(
        orgId ? "/api/cases?orgId=" + encodeURIComponent(orgId) : "/api/cases",
      ),
  });
  const rows =
    cases.data?.cases.filter(
      (c) =>
        (!status || c.status === status) &&
        (c.title + " " + c.orgName)
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="page">
      <PageHeader
        title="Investigations"
        description="Cases visible to your assigned organizations and plan segment."
        action={
          <Button variant="outline" asChild>
            <Link href="/demo">
              <FlaskConical className="h-4 w-4" />
              Open demo lab
            </Link>
          </Button>
        }
      />
      <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_260px_180px]">
        <Field label="Search cases">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or organization…"
          />
        </Field>
        <Field label="Organization">
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">All assigned</option>
            {organizations.data?.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {[
              "OPEN",
              "INVESTIGATING",
              "PENDING_APPROVAL",
              "RESOLVED",
              "ESCALATED",
            ].map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <QueryError
        error={cases.error ?? organizations.error}
        retry={() => void cases.refetch()}
      />
      {cases.isPending ? (
        <Loading label="Loading assigned cases…" />
      ) : (
        !cases.error &&
        (rows.length ? (
          <DataTable
            label="Assigned investigations"
            headers={["Case", "Organization", "Priority", "Status", "Action"]}
            minWidth={950}
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="max-w-[380px]">
                  <Link
                    href={"/cases/" + c.id}
                    className="font-semibold hover:text-primary"
                  >
                    {c.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opened {formatWhen(c.createdAt)} UTC
                  </p>
                </td>
                <td>{c.orgName}</td>
                <td>
                  <Badge
                    variant={
                      c.priority === "URGENT"
                        ? "danger"
                        : c.priority === "HIGH"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {c.priority.charAt(0) + c.priority.slice(1).toLowerCase()}
                  </Badge>
                </td>
                <td>
                  <StatusBadge value={c.status} />
                </td>
                <td>
                  <Button variant="outline" asChild>
                    <Link href={"/cases/" + c.id}>
                      <ArrowRight className="h-4 w-4" />
                      Investigate
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            description="No cases match these filters in your assigned scope."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setOrgId("");
                  setStatus("");
                  setSearch("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ))
      )}
      <Notice>
        Line engineers can investigate assigned cases and propose credits.
        Applying a credit requires a senior.
      </Notice>
      <p className="text-[13px] text-muted-foreground">
        Unassigned organizations remain inaccessible to every role.
      </p>
    </div>
  );
}
