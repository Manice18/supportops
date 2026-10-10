"use client";
import type { DemoScenario, IntegrationStatus } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  Loading,
  Notice,
  PageHeader,
  QueryError,
} from "@/components/ui/page";
import { api } from "@/lib/api";
export default function DemoPage() {
  const { state } = useAuth();
  const query = useQuery({
    queryKey: ["scenarios"],
    queryFn: () =>
      api<{ scenarios: DemoScenario[]; agntid: IntegrationStatus }>(
        "/api/demo/scenarios",
      ),
  });
  return (
    <div className="page">
      <PageHeader
        title="Demo lab"
        description="Exercise seeded workflows and backend boundaries."
        action={
          query.data && (
            <Badge variant="default">
              {query.data.scenarios.filter((s) => s.runnable).length} runnable
              scenarios
            </Badge>
          )
        }
      />
      <Notice>
        Deterministic investigator · AgntID is unconfigured. Model-backed runs
        and isolated baseline replay are future work.
      </Notice>
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading label="Loading scenarios…" />
      ) : (
        query.data && (
          <DataTable
            label="Demo scenarios"
            headers={["Scenario", "What this demonstrates", "Action"]}
            minWidth={940}
          >
            {query.data.scenarios.map((s) => {
              const assigned =
                state.status === "authenticated" &&
                state.organizations.some((o) => o.id === s.orgId);
              return (
                <tr key={s.id}>
                  <td className="w-[28%] font-medium">{s.title}</td>
                  <td className="max-w-[560px]">
                    <p>{s.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {s.milestone}
                    </p>
                    {!assigned && (
                      <p className="mt-2 text-xs text-[var(--color-warning)]">
                        Outside your current assignments. Opening verifies the
                        access boundary.
                      </p>
                    )}
                  </td>
                  <td>
                    {s.runnable && s.caseId ? (
                      <Button variant="outline" asChild>
                        <Link href={"/cases/" + s.caseId}>
                          <ArrowRight className="h-4 w-4" />
                          {assigned ? "Open case" : "View boundary"}
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" disabled>
                        Unavailable
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )
      )}
      <section className="panel space-y-4">
        <h2 className="section-title">What to verify in the flagship case</h2>
        <p>
          Run the investigation → propose the safe amount → confirm as a senior
          → verify credited entries and the remaining safe credit → repeat the
          apply request to verify replay safety.
        </p>
        <p className="text-[13px] text-muted-foreground">
          Use the full-eligible path before applying a credit to test the
          backend cap and senior approval. A line engineer can test cross-tenant
          denial; seeded seniors are assigned to all demo organizations.
        </p>
      </section>
    </div>
  );
}
