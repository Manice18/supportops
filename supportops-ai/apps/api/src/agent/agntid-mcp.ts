export type AgntidStep = {
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

const proxyUrl = () => process.env.AGNTID_MCP_URL ?? "http://localhost:8082/mcp";

export async function callThroughAgntid(tool: string, args: Record<string, unknown>): Promise<AgntidStep> {
  const name = tool.startsWith("supportops_") ? tool : `supportops_${tool}`;
  try {
    const session = await openSession();
    const body = await post(
      session,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name, arguments: args },
      },
    );
    return readStep(name, args, body);
  } catch (error) {
    return {
      tool: name.replace(/^supportops_/, ""),
      arguments: args,
      allowed: null,
      reason: error instanceof Error ? error.message : "The AgntID proxy did not respond.",
      policyName: null,
      eventId: null,
      correlationId: null,
      handlerRan: false,
      preview: "",
      log: "",
    };
  }
}

async function openSession(): Promise<string> {
  const response = await fetch(proxyUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "supportops-desk", version: "0.4.0" },
      },
    }),
  });
  const session = response.headers.get("mcp-session-id");
  if (!response.ok || !session) {
    throw new Error("AgntID proxy did not open a session. Is the runtime on port 8082?");
  }
  await fetch(proxyUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": session,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return session;
}

async function post(session: string, payload: unknown): Promise<string> {
  const response = await fetch(proxyUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": session,
    },
    body: JSON.stringify(payload),
  });
  return response.text();
}

export function readStep(tool: string, args: Record<string, unknown>, raw: string): AgntidStep {
  const message = unwrap(raw);
  const text = messageText(message) || raw;
  const flow = text ? asRecord(parseJson(text)) : null;
  const execution = asRecord(flow?.__agntid_execution_flow);
  const steps = Array.isArray(execution?.steps) ? execution.steps : [];
  const policy = asRecord(steps.map(asRecord).find((step) => step.step === "policy_evaluation")?.details);
  const executionStep = asRecord(steps.map(asRecord).find((step) => step.step === "tool_execution"));
  const allowed = typeof policy?.allowed === "boolean" ? policy.allowed : readBool(text, "allowed");
  const reason =
    (typeof policy?.reason === "string" ? policy.reason : null) ??
    readString(text, "reason") ??
    (allowed === null ? "AgntID returned a result without a policy decision." : "");
  const log = pretty(flow && Object.keys(flow).length > 0 ? flow : text);
  return {
    tool: tool.replace(/^supportops_/, ""),
    arguments: args,
    allowed,
    reason,
    policyName: (typeof policy?.policy_name === "string" ? policy.policy_name : null) ?? readString(text, "policy_name"),
    eventId: (typeof execution?.event_id === "string" ? execution.event_id : null) ?? readString(text, "event_id"),
    correlationId:
      (typeof execution?.correlation_id === "string" ? execution.correlation_id : null) ?? readString(text, "correlation_id"),
    handlerRan: allowed === true && (executionStep?.status === "success" || /tool_execution[\s\S]{0,120}success/.test(text)),
    preview: reason,
    log,
  };
}

function unwrap(raw: string): unknown {
  const data = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)
    .at(-1);
  return parseJson(data ?? raw);
}

function messageText(message: unknown): string {
  const result = asRecord(asRecord(message).result);
  const content = Array.isArray(result.content) ? result.content : [];
  const first = asRecord(content[0]);
  return typeof first.text === "string" ? first.text : "";
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readBool(text: string, key: string): boolean | null {
  const match = text.match(new RegExp(`['"]${key}['"]\\s*:\\s*(true|false|True|False)`));
  if (!match) return null;
  return match[1] === "true" || match[1] === "True";
}

function readString(text: string, key: string): string | null {
  const match = text.match(new RegExp(`['"]${key}['"]\\s*:\\s*['"]([^'"]+)['"]`));
  return match?.[1] ?? null;
}

function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
