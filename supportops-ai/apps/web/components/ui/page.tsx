import {
  Check,
  ShieldCheck,
  ShieldAlert,
  LoaderCircle,
  Inbox,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}
export function Notice({
  children,
  tone = "warning",
}: {
  children: ReactNode;
  tone?: "warning" | "success" | "danger" | "info";
}) {
  const Icon =
    tone === "success" ? Check : tone === "danger" ? ShieldAlert : ShieldCheck;
  const colors = {
    warning: "bg-[var(--color-warning-surface)] text-[var(--color-warning)]",
    success: "bg-[var(--color-success-wash)] text-[var(--color-success)]",
    danger: "bg-[var(--color-danger-wash)] text-[var(--color-danger)]",
    info: "bg-[var(--color-brand-wash)] text-primary",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg px-4 py-3.5 text-[13px] leading-5",
        colors[tone],
      )}
    >
      <Icon className="mt-0.5 h-[18px] w-[18px]" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
export function QueryError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <Notice tone="danger">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          {error instanceof Error
            ? error.message
            : "The request failed. Please try again."}
        </span>
        {retry && (
          <Button size="sm" variant="outline" onClick={retry}>
            Retry
          </Button>
        )}
        {error instanceof ApiError && error.status === 401 && (
          <Link className="underline" href="/">
            Choose identity
          </Link>
        )}
      </div>
    </Notice>
  );
}
export function Loading({ label = "Loading records…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border p-6 text-sm text-muted-foreground"
    >
      <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      {label}
    </div>
  );
}
export function EmptyState({
  title = "No matching records",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
      <Inbox className="h-7 w-7 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </section>
  );
}
export function Restricted({
  title = "Senior access required",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={
        description ??
        "Your role cannot perform this action. Sensitive data is withheld from this session."
      }
      action={
        <Button asChild>
          <Link href="/desk">View your access</Link>
        </Button>
      }
    />
  );
}
export function StatusBadge({ value }: { value: string }) {
  const good = [
    "ALLOWED",
    "ACTIVE",
    "APPLIED",
    "CREDITED",
    "COMPLETED",
    "SUBMITTED",
    "COMPLETE",
    "APPROVED",
  ];
  const bad = ["DENIED", "FAILED", "REJECTED"];
  const warn = [
    "PENDING",
    "PENDING_APPROVAL",
    "PAST_DUE",
    "UNCONFIGURED",
    "UNAVAILABLE",
    "PARTIAL",
    "NEEDS_ESCALATION",
  ];
  return (
    <Badge
      variant={
        good.includes(value.toUpperCase())
          ? "success"
          : bad.includes(value.toUpperCase())
            ? "danger"
            : warn.includes(value.toUpperCase())
              ? "warning"
              : "default"
      }
    >
      {humanize(value)}
    </Badge>
  );
}
export function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function DataTable({
  headers,
  children,
  label,
  minWidth = 720,
}: {
  headers: string[];
  children: ReactNode;
  label: string;
  minWidth?: number;
}) {
  return (
    <div className="table-wrap" tabIndex={0} aria-label={label}>
      <table className="data-table" style={{ minWidth }}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="fact-row">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
