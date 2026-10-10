"use client";
import type {
  CustomerRecord,
  PaymentReturnRecord,
  RefundRecord,
} from "@supportops/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DeskNav } from "@/components/desk-nav";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Fact,
  Field,
  Loading,
  Notice,
  PageHeader,
  QueryError,
  Restricted,
  StatusBadge,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatMoney, formatWhen } from "@/lib/utils";
export default function PaymentsPage() {
  const { state } = useAuth(),
    client = useQueryClient();
  const canReturn =
    state.status === "authenticated" &&
    state.access.actions.includes("return_payment");
  const [refundId, setRefundId] = useState(""),
    [reviewId, setReviewId] = useState<string | null>(null);
  const payments = useQuery({
    queryKey: ["desk-payments"],
    queryFn: () =>
      api<{ payments: PaymentReturnRecord[] }>("/api/desk/payments"),
    enabled: canReturn,
  });
  const refunds = useQuery({
    queryKey: ["desk-refunds"],
    queryFn: () => api<{ refunds: RefundRecord[] }>("/api/desk/refunds"),
    enabled: canReturn,
  });
  const allowed =
      refunds.data?.refunds.filter((r) => r.status === "ALLOWED") ?? [],
    selected = refundId || allowed[0]?.id || "",
    record = allowed.find((r) => r.id === reviewId);
  const customer = useQuery({
    queryKey: ["desk-customer", record?.customerId],
    queryFn: () =>
      api<{ customer: CustomerRecord }>(
        "/api/desk/customers/" + record?.customerId,
      ),
    enabled: canReturn && !!record,
  });
  const existing = payments.data?.payments.find(
    (p) => p.refundRequestId === selected,
  );
  const send = useMutation({
    mutationFn: (id: string) =>
      api<{ payment: PaymentReturnRecord; replayed: boolean }>(
        "/api/desk/payments",
        { method: "POST", body: JSON.stringify({ refundId: id }) },
      ),
    onSuccess: async () => {
      setReviewId(null);
      await client.invalidateQueries({ queryKey: ["desk-payments"] });
    },
  });
  return (
    <div className="page">
      <PageHeader
        title="Payment returns"
        description="Return an allowed refund to the mock card provider."
      />
      <DeskNav />
      {!canReturn ? (
        <Restricted description="Your role cannot view payment-return data. A senior must confirm a return." />
      ) : (
        <>
          <Notice>
            Demo provider · No real money is moved. Only allowed refund requests
            can be returned.
          </Notice>
          <QueryError
            error={payments.error ?? refunds.error}
            retry={() => {
              void payments.refetch();
              void refunds.refetch();
            }}
          />
          {refunds.isPending || payments.isPending ? (
            <Loading label="Loading allowed refunds and returns…" />
          ) : allowed.length ? (
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                send.reset();
                setReviewId(selected);
              }}
            >
              <div className="min-w-0 flex-1">
                <Field label="Allowed refund">
                  <select
                    value={selected}
                    disabled={send.isPending}
                    onChange={(e) => {
                      setRefundId(e.target.value);
                      setReviewId(null);
                      send.reset();
                    }}
                  >
                    {allowed.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.customerName} · {formatMoney(r.amountCents)} ·{" "}
                        {r.orgName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Button
                variant="outline"
                type="submit"
                disabled={!selected || send.isPending}
              >
                <ArrowRight className="h-4 w-4" />
                {existing ? "Check return" : "Review return"}
              </Button>
            </form>
          ) : (
            !refunds.error && (
              <EmptyState
                title="No allowed refunds"
                description="Allow a pending refund before submitting a payment return."
              />
            )
          )}
          {existing && !reviewId && (
            <Notice tone="success">
              This refund already has a submitted return. Repeating it returns
              the same provider reference.
            </Notice>
          )}
          {record && (
            <section
              className="panel confirmation space-y-5"
              aria-labelledby="return-title"
            >
              <div className="flex flex-wrap justify-between gap-4">
                <h2 id="return-title" className="section-title">
                  Return {formatMoney(record.amountCents)} to the mock provider
                </h2>
                <StatusBadge value={record.status} />
              </div>
              <Fact label="Customer">
                {record.customerName} · {record.orgName}
              </Fact>
              <Fact label="Return amount">
                <strong className="money text-2xl text-primary">
                  {formatMoney(record.amountCents)} USD
                </strong>
              </Fact>
              {customer.data?.customer.paymentBrand && (
                <Fact label="Payment method">
                  {customer.data.customer.paymentBrand} ending{" "}
                  {customer.data.customer.paymentLast4}
                </Fact>
              )}
              <p className="text-sm text-muted-foreground">
                Submitting creates one mock payment return. Repeating this
                request returns the existing reference.
              </p>
              <div className="flex flex-wrap justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={send.isPending}
                  onClick={() => setReviewId(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={send.isPending}
                  onClick={() => send.mutate(record.id)}
                >
                  <Check className="h-4 w-4" />
                  {send.isPending
                    ? "Submitting…"
                    : "Submit " +
                      formatMoney(record.amountCents) +
                      " mock return"}
                </Button>
              </div>
              <QueryError error={customer.error} />
            </section>
          )}
          <QueryError error={send.error} />
          {send.data && (
            <Notice tone="success">
              {send.data.replayed
                ? "Return already submitted. The existing reference was returned."
                : "Mock return submitted."}{" "}
              Reference: {send.data.payment.providerReference}
            </Notice>
          )}
          {payments.data?.payments.length ? (
            <DataTable
              label="Mock payment returns"
              headers={[
                "Customer / Refund",
                "Amount",
                "Provider",
                "Reference",
                "Status",
                "Date (UTC)",
              ]}
              minWidth={1050}
            >
              {payments.data.payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <p className="font-medium">{p.customerName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.refundRequestId}
                    </p>
                  </td>
                  <td className="money">{formatMoney(p.amountCents)}</td>
                  <td>
                    {p.provider === "mock_card" ? "Mock card" : p.provider}
                  </td>
                  <td className="font-mono text-xs">{p.providerReference}</td>
                  <td>
                    <StatusBadge value={p.status} />
                  </td>
                  <td className="whitespace-nowrap">
                    {formatWhen(p.createdAt)}
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            payments.isSuccess && (
              <p className="text-sm text-muted-foreground">
                No payment returns have been submitted.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
