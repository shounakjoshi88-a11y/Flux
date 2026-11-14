/**
 * Skills routes — Customize > Skills for Flux.
 *
 * GET    /api/skills            → merged catalog (built-ins + custom) with enabled flags
 * GET    /api/skills/:name      → single skill incl. body (for the "View" modal)
 * POST   /api/skills            → create a custom skill
 * PATCH  /api/skills/:name      → edit a custom skill (description/content/files)
 * PATCH  /api/skills/:name/toggle → enable/disable a custom skill (built-ins toggle via user_metadata on the frontend)
 * DELETE /api/skills/:name      → delete a custom skill
 *
 * Built-in enable state is Supabase user_metadata.disabledBuiltinSkills — the
 * frontend writes it directly (same pattern as enable_memory in Settings).
 */
import { Router } from 'express';
import { middleware } from '../middleware/auth';
import {
    listSkillsForUser,
    resolveSkill,
    createCustomSkill,
    updateCustomSkill,
    deleteCustomSkill,
    setCustomSkillEnabled,
    SKILL_NAME_RE,
} from '../../services/skills/registry';

function disabledBuiltin(req: any): string[] | null {
    const v = req.authUser?.user_metadata?.disabledBuiltinSkills;
    return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : null;
}

export function createSkillsRouter(): Router {
    const router = Router();

    router.get('/api/skills', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const skills = await listSkillsForUser(uid, disabledBuiltin(req));
            return res.json({ skills });
        } catch (e: any) {
            console.error('[SKILLS] list failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/api/skills/:name', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const name = String(req.params.name ?? '');
            const skill = await resolveSkill(name, uid);
            if (!skill) return res.status(404).json({ message: 'Skill not found' });
            return res.json({ skill });
        } catch (e: any) {
            console.error('[SKILLS] get failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/api/skills', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const { name, description, content, files } = req.body ?? {};
            const created = await createCustomSkill(uid, { name, description, content, files });
            return res.status(201).json({ skill: created });
        } catch (e: any) {
            const status = e?.code === 'BAD_NAME' || e?.code === 'BAD_DESC' || e?.code === 'BAD_CONTENT' || e?.code === 'TOO_BIG' || e?.code === 'BAD_FILES' || e?.code === 'TOO_MANY_FILES' ? 400 : 500;
            console.error('[SKILLS] create failed:', e?.message);
            return res.status(status).json({ message: e?.message ?? 'Internal server error' });
        }
    });

    router.patch('/api/skills/:name', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const name = String(req.params.name ?? '');
            const { description, content, files } = req.body ?? {};
            const updated = await updateCustomSkill(uid, name, { description, content, files });
            if (!updated) return res.status(404).json({ message: 'Custom skill not found (built-ins cannot be edited)' });
            return res.json({ skill: { id: updated.id, name: updated.name, description: updated.description, enabled: updated.enabled } });
        } catch (e: any) {
            console.error('[SKILLS] update failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.patch('/api/skills/:name/toggle', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const name = String(req.params.name ?? '');
            const enabled = req.body?.enabled !== false;
            const ok = await setCustomSkillEnabled(uid, name, enabled);
            if (!ok) return res.status(404).json({ message: 'Custom skill not found — built-ins toggle through user_metadata instead' });
            return res.json({ ok: true, enabled });
        } catch (e: any) {
            console.error('[SKILLS] toggle failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.delete('/api/skills/:name', middleware, async (req: any, res) => {
        try {
            const uid = req.appUserId!;
            const name = String(req.params.name ?? '');
            const ok = await deleteCustomSkill(uid, name);
            if (!ok) return res.status(404).json({ message: 'Custom skill not found (built-ins cannot be deleted)' });
            return res.json({ ok: true });
        } catch (e: any) {
            console.error('[SKILLS] delete failed:', e?.message);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
}
