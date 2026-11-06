import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import config from "../config/env";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${config.database_url}`;

// Keep one Neon connection warm: reconnecting after the 10s idle timeout costs ~1.5s.
const adapter = new PrismaPg({ connectionString, min: 1, allowExitOnIdle: true });
const prisma = new PrismaClient({
  adapter,
  log: [{ emit: "event", level: "query" }],
  transactionOptions: {
    maxWait: 5_000,
    timeout: 20_000,
  },
});

if (process.env.LOG_QUERIES === "true") {
  prisma.$on("query", (e) => {
    console.log(`${e.duration}ms | ${e.query.slice(0, 120)}`);
  });
}

export { prisma };