"use client";
import type { SubscriptionRecord } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import { DeskNav } from "@/components/desk-nav";
import {
  DataTable,
  EmptyState,
  Loading,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatMoney, formatWhen } from "@/lib/utils";
export default function SubscriptionsPage() {
  const query = useQuery({
    queryKey: ["desk-subscriptions"],
    queryFn: () =>
      api<{ subscriptions: SubscriptionRecord[] }>("/api/desk/subscriptions"),
  });
  return (
    <div className="page">
      <PageHeader
        title="Subscriptions"
        description="Plans, renewal dates and billing status across assigned organizations."
      />
      <DeskNav />
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading label="Loading subscriptions…" />
      ) : (
        !query.error &&
        (query.data?.subscriptions.length ? (
          <DataTable
            label="Subscriptions"
            headers={[
              "Customer / Organization",
              "Plan",
              "Status",
              "Amount",
              "Renewal (UTC)",
            ]}
          >
            {query.data.subscriptions.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-medium">{r.customerName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.orgName}
                  </p>
                </td>
                <td>{r.planName}</td>
                <td>
                  <StatusBadge value={r.status} />
                </td>
                <td className="money">
                  {r.amountCents === 0
                    ? "Usage based"
                    : formatMoney(r.amountCents)}
                </td>
                <td className="whitespace-nowrap">{formatWhen(r.renewalAt)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState description="No subscriptions in your assigned scope." />
        ))
      )}
      <p className="text-[13px] text-muted-foreground">
        Line engineers see their assigned plan segment. Seniors can see all
        segments in their assigned organizations.
      </p>
    </div>
  );
}
