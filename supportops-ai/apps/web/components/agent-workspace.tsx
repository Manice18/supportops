"use client";

import type { Organization, User } from "@supportops/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUp,
  Bot,
  ChevronRight,
  Clock3,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Notice, PageHeader, QueryError } from "./ui/page";

type Prompt = {
  id: string;
  title: string;
  message: string;
  expect: "allow" | "deny";
};
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
};
type Turn = { prompt: Prompt | null; reply: string; steps: Step[] };
type Request = { promptId?: string; message?: string; label: string };
type ConversationTurn = Turn & { id: string; request: string };

export function AgentWorkspace({
  user,
  organizations,
}: {
  user: User;
  organizations: Organization[];
}) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const requestToggle = useRef<HTMLButtonElement>(null);
  const closeRequests = useRef<HTMLButtonElement>(null);
  // Prevent rapid clicks before React renders the pending state.
  const sending = useRef(false);
  const prompts = useQuery({
    queryKey: ["agent-prompts", user.id],
    queryFn: () => api<{ prompts: Prompt[] }>("/api/agent/prompts"),
  });
  const run = useMutation({
    mutationFn: (request: Request) =>
      api<Turn>("/api/agent/run", {
        method: "POST",
        body: JSON.stringify(
          request.promptId
            ? { promptId: request.promptId }
            : { message: request.message },
        ),
      }),
    onSuccess: (turn, request) => {
      setTurns((current) => [
        ...current,
        { ...turn, id: crypto.randomUUID(), request: request.label },
      ]);
      if (request.message)
        setDraft((current) =>
          current.trim() === request.message ? "" : current,
        );
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  useEffect(() => {
    if (!turns.length && !run.isPending && !run.isError) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    end.current?.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion ? "instant" : "smooth",
    });
  }, [turns.length, run.isPending, run.isError]);

  useEffect(() => {
    if (showRequests) closeRequests.current?.focus();
  }, [showRequests]);

  function closeRequestView() {
    setShowRequests(false);
    requestToggle.current?.focus();
  }
  function send(request: Request) {
    if (sending.current || run.isPending) return;
    sending.current = true;
    closeRequestView();
    run.mutate(request);
  }
  const prepared = prompts.data?.prompts ?? [];
  const firstPrepared =
    prepared.find((prompt) => prompt.expect === "allow") ?? prepared[0];

  return (
    <div className="page agent-page">
      <PageHeader
        title={`${user.displayName.split(" ")[0]}’s agent`}
        description="Request an action. See the policy decision and what actually ran."
      />
      <div className="agent-mobile-context">
        <span>
          {organizations.length === 1
            ? organizations[0].name
            : "Assigned organizations"}
        </span>
        <Button
          ref={requestToggle}
          variant="outline"
          size="sm"
          aria-expanded={showRequests}
          aria-controls="agent-prepared-requests"
          onClick={() => setShowRequests(true)}
        >
          Prepared requests <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="agent-layout">
        <aside
          id="agent-prepared-requests"
          className={`agent-request-rail ${showRequests ? "is-open" : ""}`}
          aria-label="Prepared requests"
          onKeyDown={(event) => {
            if (event.key === "Escape" && showRequests) closeRequestView();
          }}
        >
          <div className="agent-rail-heading">
            <div>
              <h2 className="section-title">Prepared requests</h2>
              <p>Picked for {user.displayName.split(" ")[0]}’s role.</p>
            </div>
            <Button
              ref={closeRequests}
              className="agent-rail-close"
              variant="ghost"
              size="sm"
              aria-label="Close prepared requests"
              onClick={closeRequestView}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {prompts.isPending && (
            <p role="status" className="agent-rail-status">
              Loading prepared requests…
            </p>
          )}
          <QueryError
            error={prompts.error}
            retry={() => void prompts.refetch()}
          />
          {prompts.isSuccess && prepared.length === 0 && (
            <p className="agent-rail-status">
              No prepared requests are available for this identity. You can
              write your own request.
            </p>
          )}
          <PromptList
            title="Expected to pass"
            variant="success"
            prompts={prepared.filter((prompt) => prompt.expect === "allow")}
            pending={run.isPending}
            onRun={(prompt) =>
              send({ promptId: prompt.id, label: prompt.message })
            }
          />
          <PromptList
            title="Expected to be denied"
            variant="danger"
            prompts={prepared.filter((prompt) => prompt.expect === "deny")}
            pending={run.isPending}
            onRun={(prompt) =>
              send({ promptId: prompt.id, label: prompt.message })
            }
          />
          <div className="agent-rail-note">
            <h3>Try the access boundaries</h3>
            <p>
              These are expected outcomes, not permissions. Each request still
              goes through AgntID.
            </p>
          </div>
        </aside>
        <section
          aria-label="Agent conversation"
          className={`agent-conversation ${showRequests ? "mobile-hidden" : ""}`}
        >
          <div className="agent-conversation-heading">
            <h2>
              <Bot className="h-[18px] w-[18px] text-primary" />
              Conversation
            </h2>
            <span>
              {organizations.length === 1
                ? organizations[0].name
                : "Assigned scope"}
            </span>
          </div>
          <div
            className="agent-messages"
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
            aria-relevant="additions"
            aria-busy={run.isPending}
          >
            {turns.length === 0 && !run.isPending && !run.isError && (
              <StartingState />
            )}
            {turns.map((turn) => (
              <article className="agent-turn" key={turn.id}>
                <UserRequest name={user.displayName} message={turn.request} />
                <div className="agent-reply">
                  <h3>
                    <Bot className="h-4 w-4 text-primary" />
                    SupportOps agent
                  </h3>
                  {turn.steps.length === 0 &&
                  turn.reply.includes("AI_PROVIDER_API_KEY") ? (
                    <div className="agent-model-notice">
                      <h4>AI provider is not configured</h4>
                      <p>
                        Use a prepared request from the list to continue. No
                        tool was sent to AgntID for this message.
                      </p>
                      {firstPrepared && (
                        <Button
                          variant="outline"
                          disabled={run.isPending}
                          onClick={() =>
                            send({
                              promptId: firstPrepared.id,
                              label: firstPrepared.message,
                            })
                          }
                        >
                          <ArrowRight className="h-4 w-4" />
                          Run {firstPrepared.title}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="agent-reply-text">{turn.reply}</p>
                  )}
                </div>
                {turn.steps.map((step, index) => (
                  <ToolResult step={step} key={`${step.tool}-${index}`} />
                ))}
              </article>
            ))}
            {run.isPending && (
              <article className="agent-turn">
                <UserRequest
                  name={user.displayName}
                  message={run.variables?.label ?? "Sending request…"}
                />
                <div className="agent-reply">
                  <h3>
                    <Bot className="h-4 w-4 text-primary" />
                    SupportOps agent
                  </h3>
                  <p>Sending this request through AgntID…</p>
                </div>
                <div className="agent-working" role="status">
                  <h3>
                    <Clock3 className="h-[18px] w-[18px]" />
                    Waiting for AgntID
                  </h3>
                  <p>
                    The organization and required fields are included.
                    <br />
                    Waiting for the policy and execution result.
                  </p>
                </div>
              </article>
            )}
            {run.isError && (
              <article className="agent-turn">
                <UserRequest
                  name={user.displayName}
                  message={run.variables?.label ?? "Request"}
                />
                <Notice tone="danger">
                  <h3 className="font-semibold">
                    Request could not be completed
                  </h3>
                  <p className="mt-1">
                    {run.error instanceof Error
                      ? run.error.message
                      : "No result was returned. Try again."}
                  </p>
                  <p className="mt-2">
                    No completion has been confirmed. Review any previous result
                    before repeating a financial action.
                  </p>
                  {run.error instanceof ApiError && run.error.status === 401 ? (
                    <Link href="/" className="mt-3 inline-block underline">
                      Choose identity
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        if (run.variables) send(run.variables);
                      }}
                    >
                      Try again
                    </Button>
                  )}
                </Notice>
              </article>
            )}
            <div ref={end} />
          </div>
          <form
            className="agent-composer"
            onSubmit={(event) => {
              event.preventDefault();
              const message = draft.trim();
              if (message) send({ message, label: message });
            }}
          >
            <div className="agent-composer-input" data-pending={run.isPending}>
              <label htmlFor="agent-message" className="sr-only">
                Request for your agent
              </label>
              <textarea
                id="agent-message"
                rows={1}
                maxLength={2000}
                value={draft}
                disabled={run.isPending}
                placeholder={
                  run.isPending
                    ? "Waiting for this request to finish…"
                    : "Ask your agent to investigate or take an action…"
                }
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button
                type="submit"
                variant={
                  draft.trim() && !run.isPending ? "default" : "secondary"
                }
                disabled={run.isPending || !draft.trim()}
                className="agent-send"
                aria-label={run.isPending ? "Sending request" : "Send request"}
              >
                {run.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <ArrowUp className="h-[18px] w-[18px]" />
                )}
              </Button>
            </div>
            <p>
              {run.isPending
                ? "Prepared requests and sending are disabled while a request is running."
                : "Prepared requests work without AI setup. Typed requests require a configured model."}
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}

function PromptList({
  title,
  variant,
  prompts,
  pending,
  onRun,
}: {
  title: string;
  variant: "success" | "danger";
  prompts: Prompt[];
  pending: boolean;
  onRun: (prompt: Prompt) => void;
}) {
  if (!prompts.length) return null;
  return (
    <section className="agent-prompt-group">
      <div className="agent-prompt-heading">
        <h3>{title}</h3>
        <Badge variant={variant}>
          {prompts.length} {prompts.length === 1 ? "request" : "requests"}
        </Badge>
      </div>
      <div className="agent-prompt-list">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            className="agent-prompt"
            type="button"
            disabled={pending}
            onClick={() => onRun(prompt)}
          >
            <span>{prompt.title}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ))}
      </div>
    </section>
  );
}

function UserRequest({ name, message }: { name: string; message: string }) {
  return (
    <div className="agent-user-request">
      <span>{name}</span>
      <p>{message}</p>
    </div>
  );
}

function StartingState() {
  return (
    <div className="agent-starting">
      <div className="agent-starting-icon">
        <Bot className="h-[26px] w-[26px]" />
      </div>
      <h2>What would you like to check?</h2>
      <p>
        Start with a prepared request or write your own.
        <br />
        You’ll see the policy decision and execution result.
      </p>
      <div className="agent-request-flow">
        <span>Request</span>
        <ArrowRight />
        <span>AgntID decision</span>
        <ArrowRight />
        <span>Execution result</span>
      </div>
    </div>
  );
}

export function ToolResult({ step }: { step: Step }) {
  return (
    <div className="agent-tool-result">
      <div className="agent-tool-heading">
        <h4>{step.tool}</h4>
        <div>
          <Badge
            variant={
              step.allowed === true
                ? "success"
                : step.allowed === false
                  ? "danger"
                  : "warning"
            }
          >
            AgntID ·{" "}
            {step.allowed === null
              ? "No decision"
              : step.allowed
                ? "Allow"
                : "Deny"}
          </Badge>
          <Badge variant={step.handlerRan ? "success" : "warning"}>
            Handler ·{" "}
            {step.handlerRan
              ? "Ran"
              : step.allowed === true
                ? "Not completed"
                : "Did not run"}
          </Badge>
        </div>
      </div>
      <p
        className={`agent-tool-reason ${step.allowed === false ? "is-denied" : step.allowed === null ? "is-unknown" : ""}`}
      >
        {step.reason || "No reason was returned."}
      </p>
      <details
        className="agent-tool-disclosure"
        open={step.allowed === false ? true : undefined}
      >
        <summary>
          Tool arguments
          <ChevronRight className="h-[18px] w-[18px]" />
        </summary>
        <dl>
          {Object.entries(step.arguments).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                {typeof value === "string" ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
        {Object.keys(step.arguments).length === 0 && (
          <p>No arguments were returned.</p>
        )}
      </details>
      <div className="agent-tool-audit">
        <p>Policy name · {step.policyName ?? "Not returned"}</p>
        <dl>
          <div>
            <dt>Event</dt>
            <dd>{step.eventId ?? "Not returned"}</dd>
          </div>
          <div>
            <dt>Correlation</dt>
            <dd>{step.correlationId ?? "Not returned"}</dd>
          </div>
        </dl>
      </div>
      {step.preview && (
        <details className="agent-tool-disclosure">
          <summary>
            Result preview
            <ChevronRight className="h-[18px] w-[18px]" />
          </summary>
          <pre>{formatPreview(step.preview)}</pre>
        </details>
      )}
      {step.allowed === true && !step.handlerRan && (
        <div className="agent-tool-caution">
          Completion has not been confirmed. Review the result before sending
          another financial request.
        </div>
      )}
    </div>
  );
}

function formatPreview(preview: string) {
  try {
    return JSON.stringify(JSON.parse(preview), null, 2);
  } catch {
    return preview;
  }
}
