import { Router } from 'express';
import { prisma } from './db/prisma';
import { middleware } from './http/middleware/auth';
import { planTask, runTaskLoop, recoverInterruptedTasks } from './task-loop';

const taskRouter = Router();

taskRouter.use(middleware);

taskRouter.post('/api/tasks', async (req: any, res: any) => {
  try {
    const uid = req.appUserId!;
    const { conversationId, goal, planApprovalMode } = req.body;

    if (!goal?.trim()) return res.status(400).json({ error: 'Goal is required' });
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: uid }, select: { id: true } });
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
      select: { id: true },
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
    const uid = req.appUserId!;
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId: uid },
      select: {
        id: true, conversationId: true, status: true, title: true, goal: true,
        planApprovalMode: true, contextSummary: true, costEstimateSecs: true,
        maxDurationSecs: true, maxSteps: true, createdAt: true, updatedAt: true,
        startedAt: true, completedAt: true, lastHeartbeatAt: true, sandboxId: true,
        steps: {
          orderBy: { index: 'asc' },
          select: { id: true, index: true, title: true, status: true, dependsOn: true,
                    result: true, startedAt: true, completedAt: true, retryCount: true },
        },
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

taskRouter.get('/api/tasks/:id/stream', async (req: any, res: any) => {
  const uid = req.appUserId!;
  const taskId = req.params.id;

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: uid },
    select: { id: true, status: true, title: true },
  });
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
    const currentSteps = await prisma.taskStep.findMany({
      where: { taskId },
      orderBy: { index: 'asc' },
      select: { id: true, index: true, title: true, status: true, dependsOn: true, result: true },
    });
    writer.writeEvent('task_created', { taskId, title: task.title, existingSteps: currentSteps });
  } else {
    writer.writeEvent(`task_${task.status.toLowerCase()}`, { taskId });
    if (!res.writableEnded) res.end();
  }
});

taskRouter.post('/api/tasks/:id/cancel', async (req: any, res: any) => {
  try {
    const uid = req.appUserId!;
    const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: uid }, select: { id: true } });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await prisma.task.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

taskRouter.post('/api/tasks/:id/pause', async (req: any, res: any) => {
  try {
    const uid = req.appUserId!;
    const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: uid }, select: { id: true } });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await prisma.task.update({ where: { id: req.params.id }, data: { status: 'PAUSED' } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

taskRouter.post('/api/tasks/:id/resume', async (req: any, res: any) => {
  try {
    const uid = req.appUserId!;
    const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: uid }, select: { id: true, goal: true } });
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
      select: {
        id: true, title: true, status: true, createdAt: true, updatedAt: true,
        startedAt: true, completedAt: true, conversationId: true,
        steps: {
          orderBy: { index: 'asc' },
          select: { index: true, title: true, status: true },
        },
        _count: { select: { steps: true } },
      },
    });
    res.json(tasks);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { taskRouter };
export { recoverInterruptedTasks };
