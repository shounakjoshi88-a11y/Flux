/**
 * Document tools: read_skill and generate_document.
 *
 * read_skill hands the model the format rules for a document type; the model
 * is expected to pass that content back through generate_document, which runs
 * the generation pipeline and publishes the resulting file.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { fetchSkillFile, generateDocumentWithSkill, SKILL_REGISTRY } from '../../services/documents/generate';
import { shouldBlockFurtherTools } from './context';
import type { ToolContext } from './context';

/** Persona skills are written as markdown; the builders only know real formats. */
const PERSONA_DOC_TYPES = ['tech', 'finance', 'coder', 'creative', 'legal'];

export function createDocumentTools(ctx: ToolContext) {
    const { writer, state, model } = ctx;

    return {
        read_skill: (tool as any)({
            description:
                'Load rules for handling files or generating documents. ' +
                'Use doc_type="file" when a user uploads a file - this is the FIRST thing you should call. ' +
                'Use doc_type="design" for UI/styling rules on uploaded HTML/CSS files. ' +
                'Use other doc types (pdf, docx, pptx, xlsx, etc.) before generate_document to get generation rules.',
            inputSchema: z.object({
                doc_type: z
                    .enum([
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
                        'design',
                        'file',
                        'live-viz',
                    ])
                    .describe('The skill type to load rules for'),
            }),
            execute: async ({ doc_type }: any) => {
                if (shouldBlockFurtherTools(ctx)) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW using the search results already accumulated from 3 web searches. Do NOT call read_skill or any other tool.';
                }
                const entry = SKILL_REGISTRY[doc_type];
                if (!entry) {
                    return `No skill file registered for "${doc_type}" yet. Proceed with defaults.`;
                }
                writer.status('reading_skill', `Reading ${entry.label} rules...`, { docType: doc_type }, state.thoughtProcess);
                const content = await fetchSkillFile(entry.fileName);
                if (!content) {
                    writer.status(
                        'reading_skill_error',
                        `Skill file for "${doc_type}" not found on disk.`,
                        { docType: doc_type },
                        state.thoughtProcess,
                    );
                    return `Skill file for "${doc_type}" not found on disk. Proceed with defaults.`;
                }
                writer.status('reading_skill_success', `${entry.label} rules loaded`, { docType: doc_type }, state.thoughtProcess);
                return content;
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
