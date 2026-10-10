"use client";
import type { RefundRecord } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { DeskNav } from "@/components/desk-nav";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Loading,
  Notice,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
export default function RefundsPage() {
  const { state } = useAuth();
  const canDecide =
    state.status === "authenticated" &&
    state.access.actions.includes("decide_refund");
  const query = useQuery({
    queryKey: ["desk-refunds"],
    queryFn: () => api<{ refunds: RefundRecord[] }>("/api/desk/refunds"),
  });
  return (
    <div className="page">
      <PageHeader
        title="Refund requests"
        description="Review a request before returning funds to a payment method."
      />
      <DeskNav />
      <Notice>
        Allowing a refund records a decision. Return the payment separately from
        the Payments tab.
      </Notice>
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading label="Loading refund requests…" />
      ) : (
        !query.error &&
        (query.data?.refunds.length ? (
          <DataTable
            label="Refund requests"
            headers={[
              "Customer / Organization",
              "Amount",
              "Reason",
              "Status",
              "Action",
            ]}
            minWidth={950}
          >
            {query.data.refunds.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-medium">{r.customerName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.orgName}
                  </p>
                </td>
                <td className="money">{formatMoney(r.amountCents)}</td>
                <td className="max-w-[360px]">{r.reason}</td>
                <td>
                  <StatusBadge value={r.status} />
                </td>
                <td>
                  <Button variant="outline" asChild>
                    <Link href={"/desk/refunds/" + r.id}>
                      <ArrowRight className="h-4 w-4" />
                      {canDecide && r.status === "PENDING"
                        ? "Review request"
                        : "View request"}
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState description="No refund requests in your assigned scope." />
        ))
      )}
      <p className="text-[13px] text-muted-foreground">
        {canDecide
          ? "Only pending requests can receive a decision."
          : "You can read this queue. A senior must allow or deny a request."}
      </p>
    </div>
  );
}
