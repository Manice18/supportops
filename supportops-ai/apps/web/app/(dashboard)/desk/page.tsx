"use client";
import { TOOL_NAMES } from "@supportops/shared";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DeskNav } from "@/components/desk-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Notice, PageHeader, QueryError } from "@/components/ui/page";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/utils";
type ToolCheck = {
  tool: string;
  allowed: boolean;
  executed: false;
  enforcedBy: "api_role_gate";
  agntid: "UNCONFIGURED";
  reason: string;
};
export default function DeskPage() {
  const { state } = useAuth();
  const [tool, setTool] = useState<string>("delete_call_records"),
    [result, setResult] = useState<ToolCheck | null>(null),
    [error, setError] = useState<unknown>(null),
    [pending, setPending] = useState(false);
  if (state.status !== "authenticated") return null;
  const { user, token, organizations } = state;
  async function check() {
    setError(null);
    setResult(null);
    setPending(true);
    try {
      setResult(
        await api<ToolCheck>("/api/access/tools/check", {
          method: "POST",
          body: JSON.stringify({ tool }),
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="page">
      <PageHeader
        title="Your access"
        description="The signed session determines your role and organization scope."
      />
      <DeskNav />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{user.displayName}</h2>
            <Badge variant="success">Verified session</Badge>
          </div>
          <p>{roleLabel(user.role)}</p>
          <p className="text-[13px] text-muted-foreground">
            Issuer · {token.claims.iss}
          </p>
          <p className="text-[13px] text-muted-foreground">
            Subject · {token.claims.sub}
          </p>
          <p className="text-[13px] text-muted-foreground">
            Role checked against the database. Session token is never displayed.
          </p>
        </section>
        <section className="panel space-y-4">
          <h2 className="section-title">Assigned organizations</h2>
          {organizations.length ? (
            organizations.map((org) => (
              <div key={org.id}>
                <p className="font-medium">{org.name}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {org.plan} · {org.region}
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No assigned organizations.</p>
          )}
          <p className="text-[13px] text-muted-foreground">
            Unassigned organizations are outside your scope, including for
            senior roles.
          </p>
        </section>
      </div>
      <h2 className="section-title">Check a tool permission</h2>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <div className="min-w-0 flex-1">
          <Field label="Tool">
            <select
              value={tool}
              onChange={(e) => {
                setTool(e.target.value);
                setResult(null);
                setError(null);
              }}
            >
              {TOOL_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          <ShieldCheck className="h-4 w-4" />
          {pending ? "Checking…" : "Check permission"}
        </Button>
      </form>
      <QueryError error={error} />
      {result && (
        <>
          <Notice tone={result.allowed ? "success" : "danger"}>
            {result.allowed ? "Allowed by" : "Denied by"} the backend role gate.
            This check did not execute the tool.
            <span className="mt-1 block">{result.reason}</span>
          </Notice>
          <div className="flex flex-wrap gap-3">
            <Badge>Executed · No</Badge>
            <Badge>Enforced by · API role gate</Badge>
            <Badge variant="warning">AgntID · Unconfigured</Badge>
          </div>
        </>
      )}
      <p className="max-w-3xl text-sm text-muted-foreground">
        Line engineers can read assigned records, investigate cases and propose
        credits. Billing details, refund decisions, credit adjustments and
        payment returns require a senior.
      </p>
    </div>
  );
}
