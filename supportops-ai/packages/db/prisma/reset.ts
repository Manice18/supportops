import { createPrismaClient } from "../src/client.js";
import { assertDemoDatabaseAllowed } from "./demo-guard.js";
import { clearDemoData, seedDemoData } from "./seed-data.js";

const prisma = createPrismaClient();

try {
  assertDemoDatabaseAllowed();
  await clearDemoData(prisma);
  await seedDemoData(prisma);
  console.log("Reset local demo data and reseeded support cases.");
} finally {
  await prisma.$disconnect();
}
