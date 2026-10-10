"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, QueryError } from "@/components/ui/page";
import { api } from "@/lib/api";

type Prompt = { id: string; title: string; message: string; expect: "allow" | "deny" };
type Step = {
  tool: string;
  arguments: Record<string, unknown>;
  allowed: boolean | null;
  reason: string;
  policyName: string | null;
  eventId: string | null;
  correlationId: string | null;
  handlerRan: boolean;
  preview: string;
  log: string;
};
type Turn = { prompt: Prompt | null; reply: string; steps: Step[] };

export default function AgentPage() {
  const { state } = useAuth();
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const prompts = useQuery({
    queryKey: ["agent-prompts", state.status === "authenticated" ? state.user.id : ""],
    queryFn: () => api<{ prompts: Prompt[] }>("/api/agent/prompts"),
    enabled: state.status === "authenticated",
  });
  const run = useMutation({
    mutationFn: (body: { promptId?: string; message?: string }) =>
      api<Turn>("/api/agent/run", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (turn) => {
      setPendingText(null);
      setTurns((current) => [...current, turn]);
    },
    onError: () => setPendingText(null),
  });
  if (state.status !== "authenticated") return null;
  const allow = prompts.data?.prompts.filter((prompt) => prompt.expect === "allow") ?? [];
  const deny = prompts.data?.prompts.filter((prompt) => prompt.expect === "deny") ?? [];

  return (
    <div className="page">
      <PageHeader
        title={`${state.user.displayName}'s agent`}
        description="Click a prepared request. The agent sends that tool call through AgntID, then SupportOps runs it only if the policy allows."
      />
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          <PromptList
            title="Should pass"
            prompts={allow}
            pending={run.isPending}
            onRun={(prompt) => {
              setPendingText(prompt.message);
              run.mutate({ promptId: prompt.id });
            }}
          />
          <PromptList
            title="Should be denied"
            prompts={deny}
            pending={run.isPending}
            onRun={(prompt) => {
              setPendingText(prompt.message);
              run.mutate({ promptId: prompt.id });
            }}
          />
        </div>
        <section className="panel flex min-h-[520px] flex-col">
          <div className="flex-1 space-y-4">
            {turns.length === 0 && !run.isPending ? (
              <p className="text-sm text-muted-foreground">No request yet. Click a prompt for this engineer.</p>
            ) : (
              turns.map((turn, index) => (
                <article key={`${turn.prompt?.id ?? "free"}-${index}`} className="space-y-3">
                  <p className="text-sm font-medium">{turn.prompt?.message ?? "Typed request"}</p>
                  <p className="text-sm leading-6">{turn.reply}</p>
                  {turn.steps.map((step) => (
                    <div key={`${step.tool}-${step.eventId ?? index}`} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{step.tool}</Badge>
                        <Badge variant={step.allowed ? "success" : step.allowed === false ? "danger" : "warning"}>
                          AgntID · {step.allowed === null ? "No decision" : step.allowed ? "Allow" : "Deny"}
                        </Badge>
                        <Badge variant="outline">Handler · {step.handlerRan ? "Ran" : "Did not run"}</Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">{step.reason}</p>
                      {step.eventId ? <p className="mt-1 font-mono text-xs">Event {step.eventId}</p> : null}
                      {step.correlationId ? <p className="font-mono text-xs">Correlation {step.correlationId}</p> : null}
                      {step.log ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-medium text-primary">Full log</summary>
                          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-3 font-mono text-xs leading-5">
                            {step.log}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </article>
              ))
            )}
            {run.isPending ? <Working label={pendingText} /> : null}
          </div>
          <QueryError error={run.error} />
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const message = draft.trim();
              if (!message || run.isPending) return;
              setDraft("");
              setPendingText(message);
              run.mutate({ message });
            }}
          >
            <input
              className="h-10 flex-1 rounded-md border bg-white px-3 text-sm"
              value={draft}
              placeholder="Or tell the agent what to do"
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" disabled={run.isPending || !draft.trim()}>
              {run.isPending ? "Sending…" : "Send"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

function PromptList({
  title,
  prompts,
  pending,
  onRun,
}: {
  title: string;
  prompts: Prompt[];
  pending: boolean;
  onRun: (prompt: Prompt) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="section-title">{title}</h2>
      {prompts.map((prompt) => (
        <button
          key={prompt.id}
          type="button"
          disabled={pending}
          onClick={() => onRun(prompt)}
          className="block w-full rounded-lg border bg-white px-3 py-2 text-left text-sm hover:border-primary/40 disabled:opacity-60"
        >
          {prompt.title}
        </button>
      ))}
    </section>
  );
}

function Working({ label }: { label: string | null }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-[var(--color-brand-wash)] p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <p className="text-sm font-medium">Sending this through AgntID…</p>
      </div>
      {label ? <p className="mt-2 text-sm text-muted-foreground">{label}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">The organization and required fields are included. Waiting for the policy decision.</p>
    </div>
  );
}
