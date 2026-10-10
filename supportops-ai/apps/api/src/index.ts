import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { PrismaInvestigationStore } from "@supportops/investigation";
import { createPrismaClient } from "@supportops/db";
import { PrismaSupportOpsRepository } from "./db/prisma-repository.js";
import { apiLogFile, buildServer } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../.env") });

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16),
  DEMO_MODE: z.enum(["true", "false"]).default("true"),
});

const env = envSchema.parse(process.env);
const prisma = createPrismaClient();
const app = await buildServer({
  repo: new PrismaSupportOpsRepository(prisma),
  investigations: new PrismaInvestigationStore(prisma),
  sessionSecret: env.SESSION_SECRET,
  webOrigin: env.WEB_ORIGIN,
  demoMode: env.DEMO_MODE === "true",
  logger: true,
});

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  const logFile = apiLogFile();
  if (logFile) console.log(`API logs: ${logFile}`);
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
