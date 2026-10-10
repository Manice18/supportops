"use client";
import type { CustomerRecord } from "@supportops/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { DeskNav } from "@/components/desk-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Field,
  humanize,
  Loading,
  PageHeader,
  QueryError,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["desk-customers"],
    queryFn: () => api<{ customers: CustomerRecord[] }>("/api/desk/customers"),
  });
  const rows =
    query.data?.customers.filter((c) =>
      (c.displayName + " " + c.orgName)
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="page">
      <PageHeader
        title="Customers"
        description="Customer profiles and credit balances in your assigned organizations."
      />
      <DeskNav />
      <div className="max-w-[440px]">
        <Field label="Search customers">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or organization…"
          />
        </Field>
      </div>
      <QueryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Loading label="Loading customers…" />
      ) : (
        !query.error &&
        (rows.length ? (
          <DataTable
            label="Customers"
            headers={[
              "Customer",
              "Organization",
              "Plan",
              "Billing email",
              "Credit balance",
            ]}
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link
                    className="font-medium hover:text-primary hover:underline"
                    href={"/desk/customers/" + c.id}
                  >
                    {c.displayName}
                  </Link>
                </td>
                <td>{c.orgName}</td>
                <td>{c.plan === "PAYG" ? "PAYG" : humanize(c.plan)}</td>
                <td>{c.email ?? <Badge>Hidden · Senior access</Badge>}</td>
                <td className="money">{formatMoney(c.creditBalanceCents)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            description="Clear search to view customers in your assigned scope."
            action={
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            }
          />
        ))
      )}
      <p className="text-[13px] text-muted-foreground">
        Billing emails and card details are withheld for line engineers.
      </p>
    </div>
  );
}
