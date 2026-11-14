/**
 * Document tools: read_skill and generate_document.
 *
 * read_skill hands the model the format rules for a document type; the model
 * is expected to pass that content back through generate_document, which runs
 * the generation pipeline and publishes the resulting file.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { resolveSkill, skillNameForDocType } from '../../services/skills/registry';
import { generateDocumentWithSkill } from '../../services/documents/generate';
import { codeExecutor } from '../../sandbox/executor';
import { shouldBlockFurtherTools } from './context';
import type { ToolContext } from './context';

/** Persona skills are written as markdown; the builders only know real formats. */
const PERSONA_DOC_TYPES = ['tech', 'finance', 'coder', 'creative', 'legal'];

export function createDocumentTools(ctx: ToolContext) {
    const { writer, state, model } = ctx;

    return {
        read_skill: (tool as any)({
            description:
                'Load a skill the catalog told you exists. Pass its `skill` name (e.g. "frontend-design", "pdf-skill", "file-reading", or a custom skill the user created). ' +
                'Use doc_type instead ("file", "design", "pdf", "pptx", "docx", "xlsx", …) for backwards-compatible document-generation calls. ' +
                'Returns the skill\'s full rules; follow them for the rest of the task.',
            inputSchema: z.object({
                skill: z
                    .string()
                    .optional()
                    .describe('Skill name from the <skills> catalog, e.g. "frontend-design" or "my-custom-skill".'),
                doc_type: z
                    .string()
                    .optional()
                    .describe('Legacy: the document type (pdf, docx, file, …). Mapped to its skill automatically.'),
            }),
            execute: async ({ skill, doc_type }: any) => {
                if (shouldBlockFurtherTools(ctx)) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call read_skill or any other tool.';
                }
                const requested = (typeof skill === 'string' && skill.trim())
                    ? skill.trim().toLowerCase()
                    : (typeof doc_type === 'string' ? doc_type.trim().toLowerCase() : '');
                if (!requested) {
                    return 'read_skill requires a `skill` name from the catalog (or a legacy `doc_type`).';
                }
                // Legacy doc_type → skill name mapping (pdf → pdf-skill, …).
                const name = skillNameForDocType(requested) ?? requested;
                const resolved = await resolveSkill(name, ctx.uid);
                if (!resolved) {
                    return `No skill named "${name}" exists. Available skills are listed in the <skills> catalog.`;
                }
                writer.status('reading_skill', `Reading ${resolved.source === 'custom' ? 'your' : ''} "${resolved.name}" skill…`, { docType: resolved.name }, state.thoughtProcess);

                // Materialise bundled files into the sandbox so skill scripts can run.
                let materialisedNote = '';
                const files = resolved.files ?? {};
                const filePaths = Object.keys(files);
                if (filePaths.length > 0 && ctx.activeConversationId) {
                    const base = `/home/user/.skills/${resolved.name}`;
                    try {
                        await codeExecutor.runBash(ctx.activeConversationId, `mkdir -p "${base}"`);
                        for (const relPath of filePaths) {
                            const safe = relPath.replace(/[^\w./-]/g, '_').replace(/\.\./g, '__');
                            const dir = safe.includes('/') ? `"${base}/${safe.split('/').slice(0, -1).join('/')}"` : `"${base}"`;
                            if (safe.includes('/')) {
                                await codeExecutor.runBash(ctx.activeConversationId, `mkdir -p ${dir}`);
                            }
                            const fileContent = files[relPath] ?? '';
                            await codeExecutor.writeFile(ctx.activeConversationId, `${base}/${safe}`, fileContent);
                        }
                        materialisedNote = `\n\nThe skill bundles ${filePaths.length} supporting file(s), available at ${base}/ (${filePaths.join(', ')}). Reference them with those absolute paths — e.g. python3 ${base}/scripts/foo.py.`;
                    } catch (e: any) {
                        console.warn('[SKILLS] Could not materialise skill files:', e?.message);
                    }
                }
                writer.status('reading_skill_success', `Skill "${resolved.name}" loaded`, { docType: resolved.name }, state.thoughtProcess);
                return resolved.body + materialisedNote;
            },
        }),

        generate_document: (tool as any)({
            description:
                'Generate a downloadable document file. Do NOT use this tool for requests to create charts, graphs, diagrams, or flowcharts, unless the user explicitly requested a document file format (like "create a chart PDF" or "put the chart in a Word document"). For standard chart/diagram requests, render them inline instead. ' +
                'Always call read_skill first and pass the content here.',
            inputSchema: z.object({
                doc_type: z.enum([
                    'pdf',
                    'pptx',
                    'docx',
                    'xlsx',
                    'csv',
                    'tsv',
                    'md',
                    'json',
                    'sql',
                    'html',
                    'tech',
                    'finance',
                    'coder',
                    'creative',
                    'legal',
                ]),
                topic: z.string().describe(
                    'The detailed topic, content, research findings, and data to be included in the document. ' +
                        'Provide all specific facts, sections, text, questions, or answers that must be written into the document. ' +
                        'The document generator ONLY sees this parameter, so you MUST pass all relevant content here.',
                ),
                skill_content: z
                    .string()
                    .optional()
                    .describe('The skill file content returned by read_skill'),
            }),
            execute: async ({ doc_type, topic, skill_content }: any) => {
                if (shouldBlockFurtherTools(ctx)) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call generate_document or any other tool.';
                }
                const safeDocType = typeof doc_type === 'string' ? doc_type : '';
                const safeTopic = typeof topic === 'string' ? topic.trim() : '';
                if (!safeDocType || !safeTopic) {
                    console.warn('[TOOL] generate_document called with missing doc_type or topic');
                    return 'Document generation failed: missing doc_type or topic. Please try again.';
                }
                writer.status(
                    'generating_file',
                    `Building your ${safeDocType.toUpperCase()} on "${safeTopic.slice(0, 30)}"...`,
                    { docType: safeDocType, topic: safeTopic },
                    state.thoughtProcess,
                );
                const fakeQuery = `Create a ${safeDocType} about: ${safeTopic}`;

                // Persona types are written as markdown.
                const actualDocType = PERSONA_DOC_TYPES.includes(safeDocType) ? 'md' : safeDocType;

                const generatedFile = await generateDocumentWithSkill(
                    actualDocType as any,
                    fakeQuery,
                    model,
                    skill_content ?? '',
                    state.searchContent ?? '',
                );
                if (!generatedFile) {
                    writer.status(
                        'generating_file_error',
                        `Failed to generate the ${safeDocType.toUpperCase()} document.`,
                        { docType: safeDocType },
                        state.thoughtProcess,
                    );
                    return `Failed to generate the ${safeDocType.toUpperCase()} document. Tell the user to try again.`;
                }
                state.generatedFiles.push(generatedFile);
                writer.file(generatedFile);
                writer.status(
                    'generating_file_success',
                    `${safeDocType.toUpperCase()} "${generatedFile.filename}" ready`,
                    { docType: safeDocType, filename: generatedFile.filename },
                    state.thoughtProcess,
                );
                return (
                    `${safeDocType.toUpperCase()} file "${generatedFile.filename}" generated successfully. ` +
                    `Tell the user it is ready to download.`
                );
            },
        }),
    };
}
