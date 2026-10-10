"use client";

import {
  investigationResultSchema,
  type InvestigationResult,
  type SupportCase,
} from "@supportops/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AuditTable } from "@/components/audit-table";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  Fact,
  humanize,
  Loading,
  Notice,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/ui/page";
import { api, ApiError } from "@/lib/api";
import { formatMoney, formatWhen } from "@/lib/utils";

type EvidenceCall = {
  id: string;
  failureCategory: string | null;
  amountCents: number;
  billingStatus: string;
  eligible: boolean;
  traceId: string;
  requestId: string;
  startedAt: string;
};
type Evidence = {
  window: { start: string; end: string };
  failedCallCount: number;
  eligibleAmountCents: number;
  safeAmountCents: number;
  capCents: number;
  calls: EvidenceCall[];
  logs: Array<{
    id: string;
    callId?: string | null;
    message: string;
    eventType: string;
  }>;
  events: Array<{ id: string; callId: string; eventType: string }>;
  flags: Array<{ flagKey: string; enabled: boolean; revision: number }>;
  metrics: Array<{ timestamp: string; value: number }>;
};
type Credit = {
  id: string;
  amountCents: number;
  state: string;
  kind: "safe" | "eligible";
  idempotencyKey: string;
  appliedAt?: string | null;
};
type Approval = {
  id: string;
  amountCents: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
};
type Investigation = { id: string; findings: unknown; startedAt: string };

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  return <CaseWorkspace key={id} caseId={id} />;
}

function CaseWorkspace({ caseId }: { caseId: string }) {
  const { state } = useAuth(),
    client = useQueryClient();
  const [view, setView] = useState("Overview"),
    [reviewId, setReviewId] = useState<string | null>(null),
    [approval, setApproval] = useState<Approval | null>(null),
    [note, setNote] = useState<string | null>(null),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState<string | null>(null);
  const canApply =
    state.status === "authenticated" &&
    state.access.tools.includes("apply_credit");
  const canPropose =
    state.status === "authenticated" &&
    state.access.tools.includes("propose_credit");
  const canEscalate =
    state.status === "authenticated" &&
    state.access.tools.includes("create_escalation");
  const supportCase = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api<{ case: SupportCase }>("/api/cases/" + caseId),
  });
  const evidence = useQuery({
    queryKey: ["evidence", caseId],
    queryFn: () =>
      api<{ evidence: Evidence; credits: Credit[] }>(
        "/api/cases/" + caseId + "/evidence",
      ),
    enabled: supportCase.isSuccess,
  });
  const history = useQuery({
    queryKey: ["investigations", caseId],
    queryFn: () =>
      api<{ investigations: Investigation[] }>(
        "/api/cases/" + caseId + "/investigations",
      ),
    enabled: supportCase.isSuccess,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["evidence", caseId] }),
      client.invalidateQueries({ queryKey: ["audit", caseId] }),
    ]);
  };
  const investigate = useMutation({
    mutationFn: () =>
      api<{ findings: InvestigationResult }>(
        "/api/cases/" + caseId + "/investigations",
        { method: "POST", body: "{}" },
      ),
    onSuccess: async () => {
      setNote(null);
      setCopied(false);
      setCopyError(null);
      await client.invalidateQueries({ queryKey: ["investigations", caseId] });
      await refresh();
    },
  });
  const propose = useMutation({
    mutationFn: (kind: "safe" | "eligible") =>
      api<{ credit: Credit; replayed: boolean }>(
        "/api/cases/" + caseId + "/credits/propose",
        { method: "POST", body: JSON.stringify({ kind }) },
      ),
    onSuccess: async (r) => {
      setNote(
        r.replayed
          ? "Existing proposal returned. No duplicate proposal was created."
          : "Credit proposal recorded. A senior must confirm before the ledger changes.",
      );
      await refresh();
    },
  });
  const apply = useMutation({
    mutationFn: (key: string) =>
      api<{ credit: Credit; replayed: boolean }>(
        "/api/cases/" + caseId + "/credits/apply",
        { method: "POST", body: JSON.stringify({ idempotencyKey: key }) },
      ),
    onSuccess: async (r) => {
      setReviewId(null);
      setApproval(null);
      setNote(
        r.replayed
          ? "Existing credit returned. The mock ledger was not changed again."
          : formatMoney(r.credit.amountCents) +
              " credit applied to the mock billing ledger.",
      );
      await refresh();
    },
  });
  const escalate = useMutation({
    mutationFn: (amountCents: number) =>
      api<{ approval: Approval }>("/api/cases/" + caseId + "/escalations", {
        method: "POST",
        body: JSON.stringify({
          amountCents,
          reason: "Full eligible credit is above the backend cap.",
        }),
      }),
    onSuccess: async (r) => {
      setApproval(r.approval);
      setNote(
        "Escalation recorded. Senior approval is required before applying this proposal.",
      );
      await refresh();
    },
  });
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      api<{ approval: Approval }>(
        "/api/cases/" + caseId + "/approvals/" + approval?.id,
        { method: "POST", body: JSON.stringify({ decision }) },
      ),
    onSuccess: async (r) => {
      setApproval(r.approval);
      setNote(
        r.approval.status === "APPROVED"
          ? "Escalation approved. Confirm application to change the ledger."
          : "Escalation rejected. No billing entries changed.",
      );
      await refresh();
    },
  });
  const record = supportCase.data?.case,
    report = evidence.data?.evidence;
  const saved = history.data?.investigations
    .map((i) => ({
      result: investigationResultSchema.safeParse(i.findings),
      startedAt: i.startedAt,
    }))
    .find((i) => i.result.success);
  const findings =
    investigate.data?.findings ??
    (saved?.result.success ? saved.result.data : null);
  const credits = evidence.data?.credits ?? [],
    review = credits.find((c) => c.id === reviewId);
  const overCap = !!review && !!report && review.amountCents > report.capCents,
    approvalMatches = approval?.amountCents === review?.amountCents;
  const busy =
    propose.isPending ||
    apply.isPending ||
    escalate.isPending ||
    decide.isPending;
  const failureGroups = Object.values(
    (report?.calls ?? []).reduce<
      Record<
        string,
        {
          category: string;
          count: number;
          posted: number;
          credited: number;
          eligible: boolean;
        }
      >
    >((groups, c) => {
      const category = c.failureCategory ?? "unknown";
      const g = (groups[category] ??= {
        category,
        count: 0,
        posted: 0,
        credited: 0,
        eligible: c.eligible,
      });
      g.count++;
      if (c.billingStatus === "POSTED") g.posted += c.amountCents;
      else if (c.billingStatus === "CREDITED") g.credited += c.amountCents;
      return groups;
    }, {}),
  );
  const chooseReview = (c: Credit) => {
    apply.reset();
    escalate.reset();
    decide.reset();
    setApproval(null);
    setReviewId(c.id);
    setView("Overview");
    setNote(null);
  };
  if (supportCase.isPending)
    return (
      <div className="page">
        <Loading label="Loading case workspace…" />
      </div>
    );
  if (supportCase.error)
    return (
      <div className="page">
        {supportCase.error instanceof ApiError &&
        supportCase.error.status === 403 ? (
          <>
            <PageHeader
              title="This case is outside your scope"
              description="Organization access is checked before investigation tools run."
            />
            <Notice tone="danger">
              Access denied. This session is not assigned to the requested
              organization.
            </Notice>
            <section className="panel space-y-4">
              <h2 className="section-title">Your current session</h2>
              <p>
                {state.status === "authenticated" && state.user.displayName}
              </p>
              <p className="text-sm text-muted-foreground">
                The requested case, customer details and evidence were not
                loaded. Your signed role and assignments determine access.
              </p>
              <Button asChild>
                <Link href="/investigations">Return to assigned cases</Link>
              </Button>
            </section>
          </>
        ) : (
          <QueryError
            error={supportCase.error}
            retry={() => void supportCase.refetch()}
          />
        )}
      </div>
    );
  if (!record) return null;
  return (
    <div className="page">
      <PageHeader
        title={record.title}
        description={
          record.orgName + " · Opened " + formatWhen(record.createdAt) + " UTC"
        }
        action={
          <Button
            disabled={investigate.isPending}
            onClick={() => investigate.mutate()}
          >
            <ArrowRight className="h-4 w-4" />
            {investigate.isPending ? "Investigating…" : "Run investigation"}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={record.priority === "URGENT" ? "danger" : "warning"}>
          {humanize(record.priority)}
        </Badge>
        <StatusBadge value={record.status} />
        <span className="text-xs text-muted-foreground">
          Assigned to {record.assignedTo?.displayName ?? "unassigned"}
        </span>
      </div>
      <nav aria-label="Case sections" className="tabs">
        {["Overview", "Evidence", "Activity"].map((t) => (
          <button
            key={t}
            type="button"
            className="tab"
            aria-current={view === t ? "page" : undefined}
            onClick={() => {
              setView(t);
              setReviewId(null);
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <Notice>
        Backend role checks are active. AgntID is unconfigured and has not
        authorized these actions.
      </Notice>
      <QueryError
        error={evidence.error}
        retry={() => void evidence.refetch()}
      />
      <QueryError error={history.error} retry={() => void history.refetch()} />
      {note && <Notice tone="success">{note}</Notice>}
      {view === "Activity" ? (
        <AuditTable caseId={caseId} />
      ) : view === "Evidence" ? (
        report ? (
          <EvidenceView
            report={report}
            groups={failureGroups}
            canMetrics={
              state.status === "authenticated" &&
              state.access.tools.includes("get_service_metrics")
            }
          />
        ) : evidence.isPending ? (
          <Loading label="Loading evidence…" />
        ) : null
      ) : (
        <>
          {review && report ? (
            <section
              className="confirmation space-y-6"
              aria-labelledby="credit-review-title"
            >
              <PageHeader
                title={
                  (overCap ? "Review " : "Confirm ") +
                  formatMoney(review.amountCents) +
                  (overCap ? " credit escalation" : " case credit")
                }
                description={
                  (review.kind === "safe" ? "Safe" : "Full eligible") +
                  " proposal · " +
                  record.orgName
                }
              />
              {overCap && (
                <Notice tone="danger">
                  This proposal exceeds the {formatMoney(report.capCents)}{" "}
                  backend cap. Senior approval is required before applying it.
                </Notice>
              )}
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
                <section className="panel space-y-5">
                  <h2 id="credit-review-title" className="section-title">
                    Credit scope
                  </h2>
                  <Fact label="Organization">{record.orgName}</Fact>
                  <Fact label="Amount">
                    <strong className="money text-2xl text-primary">
                      {formatMoney(review.amountCents)} USD
                    </strong>
                  </Fact>
                  <Fact label="Backend cap">
                    {formatMoney(report.capCents)}
                  </Fact>
                  <Fact label="Proposal state">
                    <StatusBadge value={review.state} />
                  </Fact>
                  <p>
                    Applying this proposal marks the selected mock billing
                    entries credited. It does not send a payment return.
                  </p>
                </section>
                <section className="panel space-y-4">
                  <h2 className="section-title">
                    {overCap ? "Senior review" : "Senior confirmation"}
                  </h2>
                  {overCap ? (
                    <>
                      {!approvalMatches && (
                        <Button
                          className="w-full"
                          disabled={!canEscalate || busy}
                          onClick={() => escalate.mutate(review.amountCents)}
                        >
                          {escalate.isPending
                            ? "Requesting…"
                            : "Request approval for " +
                              formatMoney(review.amountCents)}
                        </Button>
                      )}
                      {approvalMatches && approval && (
                        <>
                          <StatusBadge value={approval.status} />
                          {approval.status === "PENDING" &&
                            (canApply ? (
                              <>
                                <Button
                                  className="w-full"
                                  disabled={busy}
                                  onClick={() => decide.mutate("approve")}
                                >
                                  <Check className="h-4 w-4" />
                                  Approve {formatMoney(review.amountCents)}{" "}
                                  escalation
                                </Button>
                                <Button
                                  variant="outline"
                                  className="w-full"
                                  disabled={busy}
                                  onClick={() => decide.mutate("reject")}
                                >
                                  <X className="h-4 w-4" />
                                  Reject escalation
                                </Button>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                A senior must review this escalation.
                              </p>
                            ))}
                          {approval.status === "APPROVED" && (
                            <Button
                              className="w-full"
                              disabled={!canApply || busy}
                              onClick={() =>
                                apply.mutate(review.idempotencyKey)
                              }
                            >
                              <Check className="h-4 w-4" />
                              {apply.isPending
                                ? "Applying…"
                                : "Apply " +
                                  formatMoney(review.amountCents) +
                                  " credit"}
                            </Button>
                          )}
                        </>
                      )}
                      <p className="text-[13px] text-muted-foreground">
                        Approval records a decision. Applying the credit is a
                        separate confirmation.
                      </p>
                    </>
                  ) : (
                    <>
                      <Button
                        className="w-full"
                        disabled={
                          !canApply || busy || review.state === "APPLIED"
                        }
                        onClick={() => apply.mutate(review.idempotencyKey)}
                      >
                        <Check className="h-4 w-4" />
                        {apply.isPending
                          ? "Applying…"
                          : "Apply " +
                            formatMoney(review.amountCents) +
                            " credit"}
                      </Button>
                      {!canApply && (
                        <p className="text-xs text-muted-foreground">
                          Only a senior can apply this credit.
                        </p>
                      )}
                    </>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => setReviewId(null)}
                  >
                    Back to investigation
                  </Button>
                </section>
              </div>
              <QueryError
                error={apply.error ?? escalate.error ?? decide.error}
              />
            </section>
          ) : (
            <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,1fr)]">
              <section className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="section-title">Findings</h2>
                  <span className="text-xs text-muted-foreground">
                    Deterministic investigator
                  </span>
                </div>
                <QueryError error={investigate.error} />
                {investigate.isPending && (
                  <Loading label="Correlating incident evidence…" />
                )}
                {findings ? (
                  <>
                    <StatusBadge value={findings.status} />
                    <section className="panel space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">Likely root cause</h3>
                        <Badge variant="default">
                          {humanize(findings.rootCause.confidence)} confidence
                        </Badge>
                      </div>
                      <p className="text-base leading-6">
                        {findings.rootCause.hypothesis}
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        {findings.summary}
                      </p>
                    </section>
                    <div className="space-y-3">
                      <h3 className="font-semibold">Correlated evidence</h3>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ...new Set(findings.evidence.map((e) => e.source)),
                        ].map((source) => (
                          <Badge key={source}>
                            {
                              {
                                axiom: "Axiom · logs",
                                clickhouse: "ClickHouse · events",
                                chronosphere: "Chronosphere · traces / metrics",
                                posthog: "PostHog · flags",
                                billing: "Billing · charges",
                              }[source]
                            }
                          </Badge>
                        ))}
                      </div>
                      <p className="text-[13px] text-muted-foreground">
                        The backend correlates incident records. Ticket text is
                        treated as untrusted data.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setView("Evidence")}
                      >
                        Review source records
                      </Button>
                    </div>
                    <section className="panel space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">
                          Customer response draft
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                findings.customerResponseDraft,
                              );
                              setCopied(true);
                              setCopyError(null);
                            } catch {
                              setCopied(false);
                              setCopyError(
                                "Copy unavailable. Select the response draft to copy it manually.",
                              );
                            }
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copied ? "Copied" : "Copy draft"}
                        </Button>
                      </div>
                      {copyError && <Notice tone="warning">{copyError}</Notice>}
                      <p className="whitespace-pre-wrap leading-6">
                        {findings.customerResponseDraft}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Draft from the last investigation run. Rerun after a
                        ledger change to update the amount.
                      </p>
                    </section>
                  </>
                ) : (
                  !investigate.isPending && (
                    <EmptyState
                      title="Ready to investigate"
                      description="Run the deterministic investigator to correlate calls, logs and billing evidence."
                      action={
                        <Button
                          disabled={investigate.isPending}
                          onClick={() => investigate.mutate()}
                        >
                          Run investigation
                        </Button>
                      }
                    />
                  )
                )}
                <details className="rounded-xl border px-5 py-4">
                  <summary className="cursor-pointer font-medium">
                    Customer ticket · Untrusted content
                  </summary>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                    {record.description}
                  </p>
                </details>
              </section>
              <aside className="space-y-5 rounded-xl bg-[var(--color-surface)] p-6">
                <h2 className="section-title">Credit recommendation</h2>
                {evidence.isPending ? (
                  <Loading label="Loading billing evidence…" />
                ) : (
                  report && (
                    <>
                      <div className="space-y-5">
                        <Fact label="Eligible platform failures">
                          <strong className="money text-2xl">
                            {formatMoney(report.eligibleAmountCents)}
                          </strong>
                        </Fact>
                        <Fact label="Safe telephony credit">
                          <strong className="money text-2xl text-primary">
                            {formatMoney(report.safeAmountCents)}
                          </strong>
                        </Fact>
                        <Fact label="Backend cap">
                          {formatMoney(report.capCents)}
                        </Fact>
                      </div>
                      <div className="space-y-3 border-t pt-5">
                        <h3 className="font-semibold">Credit workflow</h3>
                        <p className="text-[13px] text-muted-foreground">
                          Propose the safe amount, then confirm as a senior. The
                          mock ledger changes once.
                        </p>
                        <Button
                          className="w-full"
                          disabled={
                            !canPropose || busy || report.safeAmountCents <= 0
                          }
                          onClick={() => propose.mutate("safe")}
                        >
                          <Plus className="h-4 w-4" />
                          {propose.isPending
                            ? "Proposing…"
                            : "Propose " +
                              formatMoney(report.safeAmountCents) +
                              " safe credit"}
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={
                            !canPropose ||
                            busy ||
                            report.eligibleAmountCents <= 0
                          }
                          onClick={() => propose.mutate("eligible")}
                        >
                          Propose full eligible amount
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Line engineers can propose a credit. Applying it
                          requires senior access.
                        </p>
                      </div>
                      {report.safeAmountCents === 0 &&
                        credits.some((c) => c.state === "APPLIED") && (
                          <Notice tone="success">
                            Safe charges are credited. Remaining eligible
                            credit: {formatMoney(report.eligibleAmountCents)}.
                          </Notice>
                        )}
                      {credits.map((c) => (
                        <div key={c.id} className="space-y-3 border-t pt-4">
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-medium">
                              {humanize(c.kind)} · {formatMoney(c.amountCents)}
                            </span>
                            <StatusBadge value={c.state} />
                          </div>
                          {c.state === "PROPOSED" ? (
                            <Button
                              className="w-full"
                              variant="outline"
                              onClick={() => chooseReview(c)}
                              disabled={busy}
                            >
                              Review {formatMoney(c.amountCents)} proposal
                            </Button>
                          ) : c.state === "APPLIED" && canApply ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => apply.mutate(c.idempotencyKey)}
                            >
                              Verify replay safety
                            </Button>
                          ) : null}
                        </div>
                      ))}
                      <QueryError error={propose.error ?? apply.error} />
                      <p className="border-t pt-4 text-xs text-muted-foreground">
                        Amount checks are backend rules. AgntID has not produced
                        an authorization decision.
                      </p>
                    </>
                  )
                )}
              </aside>
            </div>
          )}
        </>
      )}
      <Button variant="ghost" asChild className="w-fit">
        <Link href="/investigations">Back to investigations</Link>
      </Button>
    </div>
  );
}

function EvidenceView({
  report,
  groups,
  canMetrics,
}: {
  report: Evidence;
  groups: Array<{
    category: string;
    count: number;
    posted: number;
    credited: number;
    eligible: boolean;
  }>;
  canMetrics: boolean;
}) {
  const [callId, setCallId] = useState(report.calls[0]?.id ?? "");
  const call = report.calls.find((c) => c.id === callId),
    logs = report.logs.filter((l) => l.callId === callId);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title">Evidence & billing</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {report.failedCallCount} failed calls ·{" "}
          {formatWhen(report.window.start)} – {formatWhen(report.window.end)}{" "}
          UTC
        </p>
      </div>
      <DataTable
        label="Failure categories and credit eligibility"
        headers={[
          "Failure category",
          "Calls",
          "Posted total",
          "Credited total",
          "Credit eligibility",
        ]}
        minWidth={900}
      >
        {groups.map((g) => (
          <tr key={g.category}>
            <td>{humanize(g.category)}</td>
            <td>{g.count}</td>
            <td className="money">{formatMoney(g.posted)}</td>
            <td className="money">{formatMoney(g.credited)}</td>
            <td>
              <Badge variant={g.eligible ? "success" : "secondary"}>
                {g.eligible
                  ? g.category === "telephony_provider"
                    ? "Eligible · Safe amount"
                    : "Eligible"
                  : "Not eligible"}
              </Badge>
            </td>
          </tr>
        ))}
      </DataTable>
      <h3 className="section-title">Incident call ledger</h3>
      <div className="max-h-[480px] overflow-auto">
        <DataTable
          label="Incident call billing ledger"
          headers={["Call", "Failure", "Charge", "Ledger", "Inspect"]}
          minWidth={900}
        >
          {report.calls.map((c) => (
            <tr key={c.id}>
              <td className="font-mono text-xs">{c.id}</td>
              <td>{c.failureCategory ? humanize(c.failureCategory) : "—"}</td>
              <td className="money">{formatMoney(c.amountCents)}</td>
              <td>
                <StatusBadge value={c.billingStatus} />
              </td>
              <td>
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={callId === c.id}
                  onClick={() => setCallId(c.id)}
                >
                  Inspect
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
      {call && (
        <section className="panel space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <h3 className="font-mono text-sm font-semibold">{call.id}</h3>
            <StatusBadge value={call.billingStatus} />
          </div>
          <p className="text-sm">
            {logs[0]?.message ?? "No correlated log available for this call."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge>Request · {call.requestId}</Badge>
            <Badge>Trace · {call.traceId}</Badge>
            <Badge>
              {call.eligible ? "Eligible" : "Not eligible"} ·{" "}
              {formatMoney(call.amountCents)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Started {formatWhen(call.startedAt)} UTC ·{" "}
            {report.events.filter((e) => e.callId === call.id).length}{" "}
            correlated call events
          </p>
        </section>
      )}
      {!!report.flags.length && (
        <section className="space-y-4">
          <h3 className="section-title">Feature flag snapshot</h3>
          {report.flags.map((f) => (
            <div key={f.flagKey} className="fact-row border-b pb-3">
              <span className="break-all text-sm">{f.flagKey}</span>
              <Badge variant={f.enabled ? "success" : "warning"}>
                {f.enabled ? "On" : "Off"} · Revision {f.revision}
              </Badge>
            </div>
          ))}
        </section>
      )}
      <section className="space-y-3">
        <h3 className="section-title">Service metrics</h3>
        {canMetrics ? (
          report.metrics.length ? (
            <DataTable
              label="Service metric samples"
              headers={["Time (UTC)", "Value"]}
            >
              {report.metrics.map((m, i) => (
                <tr key={i}>
                  <td>{formatWhen(m.timestamp)}</td>
                  <td className="money">{m.value}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <p className="text-sm text-muted-foreground">
              No metric samples in this incident window.
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Senior access is required to read aggregate service metrics.
          </p>
        )}
      </section>
    </div>
  );
}
