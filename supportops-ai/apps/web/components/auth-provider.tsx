"use client";

import type { Organization, User } from "@supportops/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";

type AccessProfile = {
  segment: "payg" | "enterprise" | "all";
  actions: string[];
  tools: string[];
};

type AccessToken = {
  accessToken: string;
  claims: { sub: string; role: User["role"]; iss: string; exp: number };
};

type Me = {
  user: User;
  organizations: Organization[];
  access: AccessProfile;
  token: AccessToken;
};

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | {
      status: "authenticated";
      user: User;
      organizations: Organization[];
      access: AccessProfile;
      token: AccessToken;
    };

const AuthContext = createContext<{
  state: AuthState;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const generation = useRef(0);

  useEffect(() => {
    const ticket = generation.current;
    api<Me>("/api/me")
      .then((me) => {
        if (generation.current === ticket)
          setState({ status: "authenticated", ...me });
      })
      .catch(() => {
        if (generation.current === ticket) setState({ status: "anonymous" });
      });
  }, []);

  async function signIn(email: string) {
    const ticket = ++generation.current;
    const me = await api<Me>("/api/demo/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (generation.current !== ticket) return;
    await queryClient.cancelQueries();
    queryClient.clear();
    setState({ status: "authenticated", ...me });
  }

  async function signOut() {
    generation.current += 1;
    await api<void>("/api/demo/logout", { method: "POST", body: "{}" });
    await queryClient.cancelQueries();
    queryClient.clear();
    setState({ status: "anonymous" });
  }

  return (
    <AuthContext.Provider value={{ state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
