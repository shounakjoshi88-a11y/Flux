import { prisma } from './db/prisma';
const conv = await prisma.conversation.findFirst({
  where: { slug: 'yo-flux-is-this-legit' },
  select: { id: true },
});
const msgs = await prisma.message.findMany({
  where: { conversationId: conv!.id },
  orderBy: { createdAt: 'asc' },
  select: { id: true, role: true, content: true, createdAt: true },
});
console.log('messages:', msgs.length);
for (const m of msgs) {
  console.log('\n=== id', m.id, m.role, m.createdAt.toISOString(), '===');
  console.log(String(m.content).slice(0, 1200));
}
process.exit(0);
