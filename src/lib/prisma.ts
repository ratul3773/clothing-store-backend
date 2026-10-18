import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import config from "../config/env";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${config.database_url}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };