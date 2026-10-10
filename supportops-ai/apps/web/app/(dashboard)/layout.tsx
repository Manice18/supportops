"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { Shell } from "@/components/shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state } = useAuth();

  useEffect(() => {
    if (state.status === "anonymous") router.replace("/");
  }, [router, state.status]);

  if (state.status !== "authenticated") {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  return <Shell>{children}</Shell>;
}
