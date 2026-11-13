/**
 * Prisma client singleton.
 *
 * One connection pool for the process. The generated client lives in
 * backend/prisma/generated and is produced by `bunx prisma generate`.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/client';
import { env } from '../config/env';

const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });
