"use client";

import { AgentWorkspace } from "@/components/agent-workspace";
import { useAuth } from "@/components/auth-provider";
import "./agent.css";

export default function AgentPage() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  return (
    <AgentWorkspace
      key={state.user.id}
      user={state.user}
      organizations={state.organizations}
    />
  );
}
