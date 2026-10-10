"use client";
import type { CreditLedgerRecord, CustomerRecord } from "@supportops/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Minus } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DeskNav } from "@/components/desk-nav";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Field,
  Loading,
  Notice,
  PageHeader,
  QueryError,
} from "@/components/ui/page";
import { api } from "@/lib/api";
import { formatMoney, formatWhen } from "@/lib/utils";
export default function CreditsPage() {
  const { state } = useAuth(),
    client = useQueryClient();
  const canAdjust =
    state.status === "authenticated" &&
    state.access.actions.includes("adjust_credit");
  const [customerId, setCustomerId] = useState(""),
    [amount, setAmount] = useState("5.00"),
    [direction, setDirection] = useState<"give" | "reduce">("give"),
    [reason, setReason] = useState("Courtesy adjustment");
  const customers = useQuery({
    queryKey: ["desk-customers"],
    queryFn: () => api<{ customers: CustomerRecord[] }>("/api/desk/customers"),
  });
  const credits = useQuery({
    queryKey: ["desk-credits"],
    queryFn: () => api<{ credits: CreditLedgerRecord[] }>("/api/desk/credits"),
  });
  const selected = customerId || customers.data?.customers[0]?.id || "",
    customer = customers.data?.customers.find((c) => c.id === selected);
  const cents = Math.round(Number(amount) * 100),
    valid =
      Number.isFinite(cents) &&
      cents > 0 &&
      reason.trim().length >= 3 &&
      !!customer &&
      (direction === "give" || cents <= customer.creditBalanceCents);
  const adjust = useMutation({
    mutationFn: () =>
      api("/api/desk/credits", {
        method: "POST",
        body: JSON.stringify({
          customerId: selected,
          amountCents: cents,
          direction,
          reason,
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["desk-credits"] }),
        client.invalidateQueries({ queryKey: ["desk-customers"] }),
        client.invalidateQueries({ queryKey: ["desk-customer", selected] }),
      ]);
    },
  });
  return (
    <div className="page">
      <PageHeader
        title="Credit adjustments"
        description={
          canAdjust
            ? "Give or reduce a customer’s courtesy balance. Senior access required."
            : "Read the courtesy balance ledger for your assigned accounts."
        }
      />
      <DeskNav />
      <QueryError
        error={customers.error ?? credits.error}
        retry={() => {
          void customers.refetch();
          void credits.refetch();
        }}
      />
      {canAdjust ? (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) adjust.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Customer">
              <select
                value={selected}
                disabled={adjust.isPending}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  adjust.reset();
                }}
              >
                {customers.data?.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} · {c.orgName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Direction">
              <select
                value={direction}
                disabled={adjust.isPending}
                onChange={(e) => {
                  setDirection(e.target.value === "reduce" ? "reduce" : "give");
                  adjust.reset();
                }}
              >
                <option value="give">Give credit</option>
                <option value="reduce">Reduce credit</option>
              </select>
            </Field>
            <Field label="Amount (USD)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                disabled={adjust.isPending}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  adjust.reset();
                }}
              />
            </Field>
          </div>
          <Field label="Reason">
            <input
              required
              minLength={3}
              maxLength={280}
              disabled={adjust.isPending}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                adjust.reset();
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm">
              {customer && Number.isFinite(cents) && (
                <>
                  Current balance{" "}
                  <span className="money">
                    {formatMoney(customer.creditBalanceCents)}
                  </span>{" "}
                  → New balance{" "}
                  <span className="money">
                    {formatMoney(
                      customer.creditBalanceCents +
                        (direction === "give" ? cents : -cents),
                    )}
                  </span>
                </>
              )}
            </p>
            <Button type="submit" disabled={!valid || adjust.isPending}>
              {direction === "give" ? (
                <Plus className="h-4 w-4" />
              ) : (
                <Minus className="h-4 w-4" />
              )}
              {adjust.isPending
                ? "Applying…"
                : (direction === "give" ? "Give " : "Reduce ") +
                  (Number.isFinite(cents) ? formatMoney(cents) : "") +
                  " credit"}
            </Button>
          </div>
          {direction === "reduce" &&
            customer &&
            cents > customer.creditBalanceCents && (
              <Notice tone="danger">
                Credit balance cannot go negative. Reduce the amount to fit the
                current balance.
              </Notice>
            )}
        </form>
      ) : (
        <Notice>
          Senior access is required to give or reduce a courtesy balance.
        </Notice>
      )}
      <QueryError error={adjust.error} />
      {adjust.isSuccess && (
        <Notice tone="success">
          Credit adjustment recorded. The balance and ledger are updated.
        </Notice>
      )}
      <h2 className="section-title">Adjustment ledger</h2>
      {credits.isPending ? (
        <Loading label="Loading credit ledger…" />
      ) : (
        !credits.error &&
        (credits.data?.credits.length ? (
          <DataTable
            label="Credit adjustment ledger"
            headers={["Customer", "Amount", "Reason", "Actor", "Date (UTC)"]}
            minWidth={900}
          >
            {credits.data.credits.map((r) => (
              <tr key={r.id}>
                <td>{r.customerName}</td>
                <td className="money">
                  {r.amountCents > 0 ? "+" : ""}
                  {formatMoney(r.amountCents)}
                </td>
                <td className="max-w-[400px]">{r.reason}</td>
                <td>{r.actorName}</td>
                <td className="whitespace-nowrap">{formatWhen(r.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState description="No courtesy balance adjustments in your assigned scope." />
        ))
      )}
      <p className="text-[13px] text-muted-foreground">
        Reductions cannot make a balance negative. Case credit proposals and
        billing-entry credits are handled in Investigations.
      </p>
    </div>
  );
}
