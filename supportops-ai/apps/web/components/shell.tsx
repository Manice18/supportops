"use client";
import {
  ChevronDown,
  Bot,
  FlaskConical,
  Inbox,
  LayoutGrid,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn, roleLabel } from "@/lib/utils";

const links = [
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/desk", label: "Desk", icon: LayoutGrid },
  { href: "/investigations", label: "Investigations", icon: Inbox },
  { href: "/security", label: "Security", icon: ShieldCheck },
  { href: "/demo", label: "Demo lab", icon: FlaskConical },
];
export function Brand() {
  return (
    <Link
      href="/investigations"
      className="flex w-fit items-center gap-2.5 font-semibold"
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary text-white">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <span className="text-lg">SupportOps</span>
    </Link>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const { state, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(false);
  if (state.status !== "authenticated") return null;
  const { user, organizations } = state;
  const initials = user.displayName
    .split(" ")
    .map((p) => p[0])
    .join("");
  const active = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    (href === "/investigations" && pathname.startsWith("/cases"));
  const deskSection = pathname.split("/")[2];
  const crumb = pathname.startsWith("/cases")
    ? "Investigations / Case workspace"
    : pathname.startsWith("/desk")
      ? "Desk / " +
        (deskSection
          ? deskSection.charAt(0).toUpperCase() + deskSection.slice(1)
          : "Access")
      : pathname === "/agent"
        ? "Agent / Workspace"
        : pathname === "/security"
          ? "Security / Case audit"
          : pathname === "/demo"
            ? "Demo lab / Backend scenarios"
            : "Investigations / Assigned cases";
  const switchIdentity = async () => {
    setPending(true);
    setError(null);
    try {
      await signOut();
      router.replace("/");
    } catch {
      setError("Sign out failed. Try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="min-h-screen md:pl-[220px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r bg-[var(--color-surface)] px-4 py-7 md:flex">
        <Brand />
        <p className="mt-1 text-[11px] text-muted-foreground">
          AI incident desk
        </p>
        <details className="relative my-7">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border bg-white px-3 text-xs font-medium">
            {organizations.length === 1
              ? organizations[0].name
              : "Assigned organizations"}
            <ChevronDown className="h-3.5 w-3.5" />
          </summary>
          <div className="absolute left-0 right-0 top-14 z-40 rounded-lg border bg-white p-3 text-xs shadow-md">
            {organizations.length ? (
              organizations.map((org) => (
                <p key={org.id} className="py-1.5">
                  {org.name}
                  <span className="mt-0.5 block text-muted-foreground">
                    {org.plan}
                  </span>
                </p>
              ))
            ) : (
              <p>No assigned organizations</p>
            )}
          </div>
        </details>
        <nav aria-label="Primary navigation" className="space-y-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex h-[42px] items-center gap-3 rounded-lg px-3 text-[13px] text-muted-foreground transition-colors hover:bg-white",
                active(href) &&
                  "bg-[var(--color-brand-wash)] font-semibold text-primary hover:bg-[var(--color-brand-wash)]",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 border-t pt-5">
          <p className="text-xs text-muted-foreground">
            {pathname === "/agent" ? "Acting as" : "Authorization provider"}
          </p>
          {pathname !== "/agent" && (
            <Badge variant="warning">AgntID unconfigured</Badge>
          )}
          <div className="flex items-center gap-3 pt-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-border text-xs font-medium">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{user.displayName}</p>
              <p className="text-[11px] text-muted-foreground">
                {roleLabel(user.role)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            disabled={pending}
            onClick={switchIdentity}
          >
            <LogOut className="h-3.5 w-3.5" />
            {pending ? "Signing out…" : "Switch identity"}
          </Button>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </aside>
      <div className="flex items-center justify-between border-b px-5 py-4 md:hidden">
        <Brand />
        <details className="relative">
          <summary
            aria-label="Your identity and access"
            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full bg-secondary text-xs font-medium"
          >
            {initials}
          </summary>
          <div className="absolute right-0 top-12 z-50 w-60 space-y-3 rounded-xl border bg-white p-4 shadow-md">
            <p className="text-sm font-medium">
              {user.displayName}
              <span className="block text-xs text-muted-foreground">
                {roleLabel(user.role)}
              </span>
            </p>
            <Link href="/desk" className="block text-sm text-primary">
              View your access
            </Link>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={switchIdentity}
            >
              <LogOut className="h-3.5 w-3.5" />
              {pending ? "Signing out…" : "Switch identity"}
            </Button>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </details>
      </div>
      <main id="main-content" className="min-w-0 px-5 pb-16 md:px-10 md:pb-0">
        <div className="flex min-h-16 items-center justify-between gap-4 border-b">
          <p className="truncate text-xs text-muted-foreground">{crumb}</p>
          <Badge variant="default" className="hidden sm:inline-flex">
            {pathname === "/agent"
              ? "Prepared requests · Demo"
              : "Demo data · API role gate"}
          </Badge>
        </div>
        {children}
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-white px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground",
              active(href) && "font-semibold text-primary",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label === "Investigations" ? "Cases" : label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
