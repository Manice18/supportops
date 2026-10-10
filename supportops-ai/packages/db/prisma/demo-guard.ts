import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../.env") });

export function assertDemoDatabaseAllowed(): void {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Refusing demo data command: set DEMO_MODE=true. This guard never targets production.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing demo data command: NODE_ENV is production.");
  }
  const url = process.env.DATABASE_URL ?? "";
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  if (!local) {
    throw new Error("Refusing demo data command: DATABASE_URL must point at localhost or 127.0.0.1.");
  }
}
