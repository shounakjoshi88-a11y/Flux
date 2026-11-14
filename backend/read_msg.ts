import { prisma } from './db/prisma';
const m = await prisma.message.findUnique({ where: { id: 2583 }, select: { content: true } });
const c = String(m?.content ?? '');
console.log('length:', c.length);
console.log('middle section (1500-2600):', c.slice(1500, 2600));
console.log('\ntail (2600+):', c.slice(2600));
process.exit(0);
