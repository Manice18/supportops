"use client";
import { demoIdentities } from "@supportops/mock-data/identities";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Brand } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/page";
import { cn, roleLabel } from "@/lib/utils";
const scope: Record<string, string> = {
  CSE_ENTERPRISE: "Assigned enterprise cases · Investigate and propose credits",
  CSE_PAYG: "Assigned PAYG cases · Investigate and propose credits",
  CSE_ENTERPRISE_SENIOR: "Assigned accounts · Financial review and actions",
  CSE_PAYG_SENIOR: "Assigned accounts · Financial review and actions",
};
export default function LoginPage() {
  const router = useRouter(),
    { state, signIn } = useAuth();
  const [selected, setSelected] = useState(demoIdentities[0].email),
    [error, setError] = useState<unknown>(null),
    [pending, setPending] = useState(false);
  useEffect(() => {
    if (state.status === "authenticated") router.replace("/investigations");
  }, [router, state.status]);
  async function enter() {
    setError(null);
    setPending(true);
    try {
      await signIn(selected);
      router.push("/investigations");
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[40%_60%]">
      <section className="flex flex-col border-b bg-[var(--color-surface)] px-6 py-8 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
        <Brand />
        <div className="my-auto py-10 lg:py-24">
          <h1 className="max-w-md text-3xl font-semibold leading-[1.5] tracking-[-0.02em] lg:text-[42px]">
            Investigate with
            <br />
            context.
            <br />
            Act with authority.
          </h1>
          <p className="mt-7 max-w-sm text-base leading-6 text-muted-foreground">
            A support desk for voice AI incidents.
            <br />
            Follow the evidence. Keep every action within the right permissions.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4 border-y py-6 text-[13px]">
            <span>Ticket</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span>Evidence</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-primary">Confirmed action</span>
          </div>
          <p className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Backend role gate active · AgntID unconfigured
          </p>
        </div>
      </section>
      <section className="px-6 py-8 lg:px-[9%] lg:py-12">
        <div className="mx-auto max-w-[714px]">
          <div className="mb-12 flex justify-between text-[13px] text-muted-foreground">
            <span>SupportOps AI</span>
            <Badge variant="default">Synthetic demo</Badge>
          </div>
          <h2 className="text-[28px] font-semibold leading-10">
            Choose your demo identity
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Explore the desk with a seeded support role.
            <br />
            Your signed session determines access and actions.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enter();
            }}
          >
            <fieldset
              disabled={pending || state.status === "loading"}
              className="mt-7 space-y-2"
            >
              <legend className="sr-only">Demo identity</legend>
              {demoIdentities.map((identity) => (
                <label
                  key={identity.email}
                  className={cn(
                    "flex min-h-[64px] cursor-pointer items-center gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-muted",
                    selected === identity.email &&
                      "border-primary bg-[var(--color-brand-wash)]/40",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium"
                  >
                    {identity.displayName
                      .split(" ")
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">
                      {identity.displayName} · {roleLabel(identity.role)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {scope[identity.role]}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="identity"
                    value={identity.email}
                    checked={selected === identity.email}
                    onChange={() => setSelected(identity.email)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              ))}
            </fieldset>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">
                Selected:{" "}
                {demoIdentities.find((i) => i.email === selected)?.displayName}
              </span>
              <Button
                type="submit"
                disabled={pending || state.status === "loading"}
              >
                <ArrowRight className="h-4 w-4" />
                {pending ? "Entering workspace…" : "Enter workspace"}
              </Button>
            </div>
          </form>
          <div className="mt-4">
            <QueryError error={error} />
          </div>
          <p className="mt-7 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Synthetic data · Signed session roles · AgntID unconfigured
          </p>
        </div>
      </section>
    </div>
  );
}
