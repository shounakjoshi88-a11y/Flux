/**
 * Skill tools — the model-facing half of the skills system.
 *
 * `manage_skill` lets Claude create, update, delete and list the user's
 * skills from inside a conversation. A skill created here is usable in the
 * very next message: it shows up in the catalog and read_skill resolves it.
 */
import { tool } from 'ai';
import { z } from 'zod';
import {
    listSkillsForUser,
    createCustomSkill,
    updateCustomSkill,
    deleteCustomSkill,
} from '../../services/skills/registry';
import type { ToolContext } from './context';
import { shouldBlockFurtherTools } from './context';

export function createSkillsTools(ctx: ToolContext) {
    const { writer, state, uid } = ctx;

    return {
        manage_skill: (tool as any)({
            description:
                'Create, list, update or delete the user\'s agent skills. Use this when the user asks to ' +
                '"make a skill", "turn this into a skill", "save this workflow as a skill", "improve my X skill", ' +
                '"delete my X skill", or "what skills do I have". A skill is reusable instructions the model loads ' +
                'via read_skill when a task matches. Skill names: lowercase letters, digits, hyphens, max 64 chars. ' +
                'The description is the ONLY thing the model sees before deciding to load the skill — write it as ' +
                '"Use when <specific trigger>: <what it does>."',
            inputSchema: z.object({
                action: z.enum(['list', 'create', 'update', 'delete']),
                name: z
                    .string()
                    .optional()
                    .describe('Skill name (lowercase, e.g. "standup-notes"). Required for create/update/delete.'),
                description: z
                    .string()
                    .optional()
                    .describe('One line: what the skill does + when to use it. Required for create.'),
                content: z
                    .string()
                    .optional()
                    .describe('The full skill instructions (markdown body). Required for create. For update, the full new body.'),
            }),
            execute: async ({ action, name, description, content }: any) => {
                if (shouldBlockFurtherTools(ctx)) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated.';
                }
                if (!uid) {
                    return 'Skills require an authenticated session. Cannot manage skills here.';
                }
                const safeName = typeof name === 'string' ? name.trim().toLowerCase() : undefined;

                if (action === 'list') {
                    const skills = await listSkillsForUser(uid, ctx.disabledBuiltinSkills ?? null);
                    return skills
                        .map((s) => `${s.enabled ? 'on ' : 'off'} ${s.name} (${s.source}) — ${s.description}`)
                        .join('\n');
                }

                if (action === 'create') {
                    try {
                        const skill = await createCustomSkill(uid, {
                            name: safeName ?? '',
                            description: description ?? '',
                            content: content ?? '',
                        });
                        writer.status('reading_skill_success', `Created skill "${skill.name}"`, { docType: skill.name }, state.thoughtProcess);
                        return `Created skill "${skill.name}" (custom, enabled). It is available immediately — read it with read_skill({ skill: "${skill.name}" }) and it loads automatically whenever a task matches its description.`;
                    } catch (e: any) {
                        writer.status('reading_skill_error', `Could not create skill: ${e?.message}`, { docType: safeName ?? '' }, state.thoughtProcess);
                        return `Skill creation failed: ${e?.message}`;
                    }
                }

                if (action === 'update') {
                    const updated = await updateCustomSkill(uid, safeName ?? '', { description, content });
                    if (!updated) {
                        return `No custom skill named "${safeName}" found (built-ins cannot be edited — create a custom skill with the same name to override it).`;
                    }
                    writer.status('reading_skill_success', `Updated skill "${updated.name}"`, { docType: updated.name }, state.thoughtProcess);
                    return `Updated skill "${updated.name}".`;
                }

                if (action === 'delete') {
                    const ok = await deleteCustomSkill(uid, safeName ?? '');
                    if (!ok) return `No custom skill named "${safeName}" found (built-ins cannot be deleted).`;
                    writer.status('reading_skill_success', `Deleted skill "${safeName}"`, { docType: safeName ?? '' }, state.thoughtProcess);
                    return `Deleted skill "${safeName}".`;
                }

                return 'Unknown manage_skill action.';
            },
        }),
    };
}
