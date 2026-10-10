import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ROLE_LABELS: Record<string, string> = {
  CSE_PAYG: "CSE · Pay as you go",
  CSE_ENTERPRISE: "CSE · Enterprise",
  CSE_PAYG_SENIOR: "Senior CSE · Pay as you go",
  CSE_ENTERPRISE_SENIOR: "Senior CSE · Enterprise",
};

export function roleLabel(role: string) {
  return (
    ROLE_LABELS[role] ??
    role
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}
