import { Router } from 'express';
import { prisma } from './db';
import { middleware } from './middleware';
import { planTask, runTaskLoop, recoverInterruptedTasks } from './task-loop';

const taskRouter = Router();

taskRouter.use(middleware);

taskRouter.post('/api/tasks', async (req: any, res: any) => {
  try {
    const uid = req.appUserId!;
    const { conversationId, goal, planApprovalMode } = req.body;

    if (!goal?.trim()) return res.status(400).json({ error: 'Goal is required' });
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const title = goal.trim().slice(0, 120);

    const task = await prisma.task.create({
      data: {
        conversationId,
        userId: uid,
        title,
        goal: goal.trim(),
        planApprovalMode: !!planApprovalMode,
      },
    });

    res.status(202).json({ taskId: task.id, title, status: 'PENDING' });

    if (!planApprovalMode) {
      await planTask(task.id);
      runTaskLoop(task.id).catch(e => console.error('[TASK] Loop error:', e));
    }
  } catch (e: any) {
    console.error('[TASK] Create error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

taskRouter.get('/api/tasks/:id', async (req: any, res: any) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { index: 'asc' } } },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

taskRouter.get('/api/tasks/:id/stream', async (req: any, res: any) => {
  const taskId = req.params.id;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const writer = {
    writeStatus: (subtype: string, message: string, data?: any) => {
      if (!res.writableEnded) {
        res.write(`event: status\ndata: ${JSON.stringify({ subtype, message, data })}\n\n`);
      }
    },
    writeText: (text: string) => {
      if (!res.writableEnded) {
        res.write(`data: ${text}\n\n`);
      }
    },
    writeEvent: (event: string, data: any) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    },
    get writableEnded() { return res.writableEnded; },
  };

  const cancelRef = { cancelled: false };

  req.on('close', () => { cancelRef.cancelled = true; });

  if (task.status === 'PENDING' || task.status === 'PLANNING') {
    await planTask(taskId);
    runTaskLoop(taskId, writer, cancelRef).catch(e => console.error('[TASK] Loop error:', e));
  } else if (task.status === 'RUNNING') {
    const currentSteps = await prisma.taskStep.findMany({ where: { taskId }, orderBy: { index: 'asc' } });
    writer.writeEvent('task_created', { taskId, title: task.title, existingSteps: currentSteps });
  } else {
    writer.writeEvent(`task_${task.status.toLowerCase()}`, { taskId });
    if (!res.writableEnded) res.end();
  }
});

taskRouter.post('/api/tasks/:id/cancel', async (req: any, res: any) => {
  try {
    await prisma.task.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

taskRouter.post('/api/tasks/:id/pause', async (req: any, res: any) => {
  try {
    await prisma.task.update({ where: { id: req.params.id }, data: { status: 'PAUSED' } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

taskRouter.post('/api/tasks/:id/resume', async (req: any, res: any) => {
  try {
    await prisma.task.update({ where: { id: req.params.id }, data: { status: 'PENDING' } });
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (task && !task.goal) {
      await planTask(task.id);
    }
    runTaskLoop(req.params.id).catch(e => console.error('[TASK] Resume error:', e));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

taskRouter.get('/api/tasks', async (req: any, res: any) => {
  try {
    const uid = req.appUserId!;
    const tasks = await prisma.task.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { steps: { orderBy: { index: 'asc' } }, _count: { select: { steps: true } } },
    });
    res.json(tasks);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { taskRouter };
export { recoverInterruptedTasks };
