"use client";
import type { RefundRecord } from "@supportops/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { DeskNav } from "@/components/desk-nav";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  Loading,
  Notice,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatMoney, roleLabel } from "@/lib/utils";
export default function RefundReviewPage() {
  const { id } = useParams<{ id: string }>(),
    { state } = useAuth(),
    client = useQueryClient();
  const canDecide =
    state.status === "authenticated" &&
    state.access.actions.includes("decide_refund");
  const query = useQuery({
    queryKey: ["desk-refunds"],
    queryFn: () => api<{ refunds: RefundRecord[] }>("/api/desk/refunds"),
  });
  const record = query.data?.refunds.find((r) => r.id === id);
  const decide = useMutation({
    mutationFn: (decision: "allow" | "deny") =>
      api<{ refund: RefundRecord }>("/api/desk/refunds/" + id + "/decision", {
        method: "POST",
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["desk-refunds"] }),
  });
  return (
    <div className="page">
      <PageHeader
        title={
          record
            ? "Review " + record.customerName + "’s refund request"
            : "Refund review"
        }
        description={
          record &&
          record.orgName +
            " · " +
            formatMoney(record.amountCents) +
            " requested"
        }
        action={record && <StatusBadge value={record.status} />}
      />
      <DeskNav />
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading label="Loading refund request…" />
      ) : (
        !query.error &&
        (record ? (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
              <section className="panel space-y-5">
                <h2 className="section-title">Request context</h2>
                <p className="text-base">{record.reason}</p>
                <p className="text-[13px] text-muted-foreground">
                  {record.customerName} · {record.orgName}
                </p>
                {record.supportCaseId && (
                  <Button variant="outline" asChild>
                    <Link href={"/cases/" + record.supportCaseId}>
                      <ArrowRight className="h-4 w-4" />
                      View investigation
                    </Link>
                  </Button>
                )}
              </section>
              <section className="panel space-y-4">
                <h2 className="section-title">Record a decision</h2>
                <p className="text-[13px] text-muted-foreground">
                  {state.status === "authenticated" &&
                    state.user.displayName + " · " + roleLabel(state.user.role)}
                </p>
                <p>
                  This decides the {formatMoney(record.amountCents)} refund
                  request. Case credit eligibility is a separate workflow.
                </p>
                {record.status === "PENDING" ? (
                  <>
                    <Button
                      className="w-full"
                      disabled={!canDecide || decide.isPending}
                      onClick={() => decide.mutate("allow")}
                    >
                      <Check className="h-4 w-4" />
                      {decide.isPending
                        ? "Recording…"
                        : "Allow " +
                          formatMoney(record.amountCents) +
                          " refund"}
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={!canDecide || decide.isPending}
                      onClick={() => decide.mutate("deny")}
                    >
                      <X className="h-4 w-4" />
                      Deny request
                    </Button>
                    {!canDecide && (
                      <p className="text-xs text-muted-foreground">
                        Senior access required to record a decision.
                      </p>
                    )}
                  </>
                ) : (
                  <Notice
                    tone={record.status === "ALLOWED" ? "success" : "info"}
                  >
                    Decision recorded: {record.status.toLowerCase()}.
                    {record.status === "ALLOWED" && (
                      <Link
                        className="mt-2 block underline"
                        href="/desk/payments"
                      >
                        View payment returns
                      </Link>
                    )}
                  </Notice>
                )}
              </section>
            </div>
            <Notice>
              This decision does not send money. An allowed request becomes
              eligible for a mock payment return.
            </Notice>
            <QueryError
              error={decide.error}
              retry={() => void query.refetch()}
            />
            {decide.error && (
              <p className="text-sm text-muted-foreground">
                If another senior decided first, refresh the request to see its
                current status.
              </p>
            )}
          </>
        ) : (
          <EmptyState
            title="Request unavailable"
            description="This refund was not found in your assigned scope."
          />
        ))
      )}
      <Button variant="outline" asChild className="w-fit">
        <Link href="/desk/refunds">Back to refund requests</Link>
      </Button>
    </div>
  );
}
