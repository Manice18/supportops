import type { User } from "@supportops/shared";
import { callThroughAgntid, type AgntidStep } from "./agntid-mcp.js";
import { completeArguments, type EngineerContext } from "./context.js";
import { promptById, promptsFor, type DemoPrompt } from "./prompts.js";

export type AgentTurn = {
  prompt: { id: string; title: string; message: string; expect: "allow" | "deny" } | null;
  reply: string;
  steps: AgntidStep[];
};

export async function runPrompt(user: User, promptId: string, context: EngineerContext): Promise<AgentTurn | null> {
  const prompt = promptById(user.id, promptId);
  if (!prompt) return null;
  const step = await callThroughAgntid(prompt.tool, completeArguments(prompt.tool, prompt.arguments, context));
  return { prompt: publicPrompt(prompt), reply: narrate(user, step), steps: [step] };
}

export async function runMessage(user: User, message: string, context: EngineerContext): Promise<AgentTurn> {
  const key = process.env.AI_PROVIDER_API_KEY;
  if (!key) {
    return {
      prompt: null,
      reply: "Type a request after AI_PROVIDER_API_KEY is set, or click one of the prepared prompts. Those already go through AgntID.",
      steps: [],
    };
  }
  const steps: AgntidStep[] = [];
  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: `You are the SupportOps agent for ${user.displayName} (${user.role}). Their organization is ${context.orgId} and their case is ${context.caseId}. Every tool call must include orgId and the other required fields. Calls are sent to AgntID before SupportOps runs them. Explain only the AgntID result in the tool response. Do not invent an allow, a deny, or an audit id.`,
    },
    { role: "user", content: message },
  ];
  for (let turn = 0; turn < 4; turn += 1) {
    const completion = await complete(key, messages);
    const call = completion.tool_calls?.[0];
    if (!call) {
      return { prompt: null, reply: completion.content || "No tool was sent to AgntID.", steps };
    }
    const args = completeArguments(call.function.name, parseArgs(call.function.arguments), context);
    const step = await callThroughAgntid(call.function.name, args);
    steps.push(step);
    messages.push({ role: "assistant", content: completion.content, tool_calls: completion.tool_calls });
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(step) });
  }
  return { prompt: null, reply: narrate(user, steps.at(-1)!), steps };
}

export function listPrompts(userId: string) {
  return promptsFor(userId).map(publicPrompt);
}

function publicPrompt(prompt: DemoPrompt) {
  return { id: prompt.id, title: prompt.title, message: prompt.message, expect: prompt.expect };
}

function narrate(user: User, step: AgntidStep): string {
  if (step.allowed === null) {
    return `${user.displayName}, AgntID did not return a policy decision. ${step.reason}`;
  }
  const event = step.eventId ? ` Event ${step.eventId}.` : "";
  if (!step.allowed) {
    return `${user.displayName}, AgntID denied ${step.tool}. ${step.reason}${event} The SupportOps handler did not run.`;
  }
  const handler = step.handlerRan ? "The SupportOps handler ran." : "AgntID allowed the call. The handler did not finish.";
  return `${user.displayName}, AgntID allowed ${step.tool}. ${step.reason}${event} ${handler}`;
}

async function complete(key: string, messages: Array<Record<string, unknown>>) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      tools: toolDefs,
      tool_choice: "auto",
    }),
  });
  if (!response.ok) {
    throw new Error("The model request failed. The prepared prompts still go through AgntID.");
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
  };
  return body.choices?.[0]?.message ?? {};
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const toolDefs = [
  "get_support_case",
  "search_axiom_logs",
  "get_clickhouse_events",
  "get_chronosphere_trace",
  "get_service_metrics",
  "get_posthog_flags",
  "get_billing_entries",
  "calculate_eligible_credit",
  "propose_credit",
  "apply_credit",
  "create_escalation",
  "update_org_config",
  "set_feature_flag",
  "delete_call_records",
].map((name) => ({
  type: "function",
  function: {
    name,
    description: `Call ${name} through AgntID. Always include orgId. Include caseId, the time window, and every other field the tool requires.`,
    parameters: { type: "object", additionalProperties: true },
  },
}));
