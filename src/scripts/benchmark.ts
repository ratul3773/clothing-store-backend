import { performance } from "node:perf_hooks";
import { prisma } from "../lib/prisma";

async function benchmark() {
  for (let i = 1; i <= 10; i++) {
    const start = performance.now();

    await prisma.$queryRaw`SELECT 1`;

    console.log(
      `SELECT 1 #${i}: ${(performance.now() - start).toFixed(2)}ms`
    );
  }

  await prisma.$disconnect();
}

benchmark().catch(console.error);