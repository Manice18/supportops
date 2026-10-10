"use client";
import type { CustomerRecord } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { DeskNav } from "@/components/desk-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  humanize,
  Loading,
  Notice,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatMoney, roleLabel } from "@/lib/utils";
export default function CustomerPage() {
  const { id } = useParams<{ id: string }>(),
    { state } = useAuth();
  const query = useQuery({
    queryKey: ["desk-customer", id],
    queryFn: () =>
      api<{ customer: CustomerRecord }>("/api/desk/customers/" + id),
  });
  const r = query.data?.customer;
  const hidden = <Badge>Hidden · Senior access required</Badge>;
  return (
    <div className="page">
      <PageHeader
        title={r?.displayName ?? "Customer profile"}
        description={r && r.orgName + " · Customer profile"}
        action={r && <StatusBadge value={r.status} />}
      />
      <DeskNav />
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading label="Loading customer profile…" />
      ) : (
        r && (
          <>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="section-title">Profile</h2>
              <p className="text-[13px] text-muted-foreground">
                {state.status === "authenticated" &&
                  state.user.displayName + " · " + roleLabel(state.user.role)}
              </p>
            </div>
            <DataTable
              label="Customer profile"
              minWidth={0}
              headers={["Field", "Value"]}
            >
              {[
                ["Plan", r.plan === "PAYG" ? "PAYG" : humanize(r.plan)],
                ["Region", r.region],
                [
                  "Customer status",
                  <StatusBadge key="status" value={r.status} />,
                ],
                ["Credit balance", formatMoney(r.creditBalanceCents)],
                ["Billing email", r.email ?? hidden],
                [
                  "Payment method",
                  r.paymentBrand && r.paymentLast4
                    ? humanize(r.paymentBrand) + " ending " + r.paymentLast4
                    : hidden,
                ],
              ].map(([label, value]) => (
                <tr key={String(label)}>
                  <td className="w-1/3 text-muted-foreground">{label}</td>
                  <td className="break-words">{value}</td>
                </tr>
              ))}
            </DataTable>
            {!r.email && (
              <Notice>
                Your role can view customer profiles. Billing email and card
                details are withheld by the API.
              </Notice>
            )}
          </>
        )
      )}
      <Button variant="outline" asChild className="w-fit">
        <Link href="/desk/customers">Back to customers</Link>
      </Button>
    </div>
  );
}
