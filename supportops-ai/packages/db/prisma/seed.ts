import { createPrismaClient } from "../src/client.js";
import { assertDemoDatabaseAllowed } from "./demo-guard.js";
import { seedDemoData } from "./seed-data.js";

const prisma = createPrismaClient();

try {
  assertDemoDatabaseAllowed();
  await seedDemoData(prisma);
  console.log("Seeded demo users, organizations, assignments, and support cases.");
} finally {
  await prisma.$disconnect();
}
