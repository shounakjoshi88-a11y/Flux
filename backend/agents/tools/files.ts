/**
 * Sandbox file tools: read, write, list, edit, install.
 *
 * All of them operate on the conversation's sandbox workspace through
 * `codeExecutor`, and all of them report what they are doing through the
 * request's writer so the UI can show progress.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { codeExecutor } from '../../sandbox/executor';
import { conversationKey, shouldBlockFurtherTools, TOOL_BLOCKED_MESSAGE } from './context';
import type { ToolContext } from './context';

export function createFileTools(ctx: ToolContext) {
    const { writer, state } = ctx;

    return {
        read_file: (tool as any)({
            description:
                'Read contents of a TEXT or CODE file from the sandbox. Do NOT use on binary files (PDF, DOCX, XLSX, PPTX, images, archives) — use run_bash with Python tools instead (pandas for CSV, pymupdf for PDF, openpyxl for XLSX, python-docx for DOCX, python-pptx for PPTX).',
            inputSchema: z.object({
                path: z.string().describe('Absolute path like /home/user/data.csv'),
            }),
            execute: async ({ path }: any) => {
                const cid = conversationKey(ctx);
                const filename = path.split('/').pop() || 'file';
                writer.status('reading_file', `Reading ${filename}...`, { path, filename }, state.thoughtProcess);
                try {
                    const content = await codeExecutor.readFile(cid, path);
                    writer.status(
                        'reading_file_success',
                        `Read ${filename}`,
                        { path, filename, size: content.length },
                        state.thoughtProcess,
                    );
                    return `Contents of ${path}:\n\n${content}`;
                } catch (e: any) {
                    writer.status(
                        'reading_file_error',
                        `Failed to read ${filename}: ${e.message}`,
                        { path, error: e.message },
                        state.thoughtProcess,
                    );
                    return `Failed to read ${path}: ${e.message}`;
                }
            },
        }),

        write_file: (tool as any)({
            description:
                'ONLY use for NEW files (creating from scratch). For editing existing files, ALWAYS prefer edit_file (surgical string replacement) instead. After writing a code file, call run_bash next to compile and execute it.',
            inputSchema: z.object({
                path: z.string().describe('File path like /home/user/output.csv'),
                content: z.string().describe('Full file content'),
            }),
            execute: async ({ path, content }: any) => {
                if (shouldBlockFurtherTools(ctx)) return TOOL_BLOCKED_MESSAGE;

                const cid = conversationKey(ctx);
                const filename = path.split('/').pop() || 'file';
                const ext = filename.split('.').pop()?.toLowerCase() || '';
                const langMap: Record<string, string> = {
                    c: 'c',
                    cpp: 'cpp',
                    py: 'python',
                    js: 'javascript',
                    ts: 'typescript',
                    html: 'html',
                    css: 'css',
                    sh: 'bash',
                    json: 'json',
                    md: 'markdown',
                    rs: 'rust',
                    go: 'go',
                    java: 'java',
                };
                const language = langMap[ext] || 'text';
                writer.status('generating_file', `Writing ${filename}...`, { path, filename, content, language }, state.thoughtProcess);
                try {
                    await codeExecutor.writeFile(cid, path, content);
                    writer.status(
                        'generating_file_success',
                        `Wrote ${filename}`,
                        { path, filename, content, language },
                        state.thoughtProcess,
                    );
                    const codeExts = ['c', 'cpp', 'cs', 'py', 'js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'rs', 'go', 'java', 'kt', 'swift', 'rb', 'php'];
                    const isCode = codeExts.includes(ext);
                    return isCode
                        ? `File written to ${path}. Now call run_bash to compile and test it. Do NOT explain yet — just call run_bash.`
                        : `File written to ${path}.`;
                } catch (e: any) {
                    writer.status('generating_file_error', `Failed to write ${filename}: ${e.message}`, { path }, state.thoughtProcess);
                    return `Failed to write ${path}: ${e.message}`;
                }
            },
        }),

        list_files: (tool as any)({
            description: 'List files in a sandbox directory.',
            inputSchema: z.object({
                path: z.string().optional().describe('Directory path, default /home/user'),
            }),
            execute: async ({ path }: any) => {
                const cid = conversationKey(ctx);
                try {
                    const files = await codeExecutor.listFiles(cid, path || '/home/user');
                    return `Files in ${path || '/home/user'}:\n${files.join('\n') || '(empty)'}`;
                } catch (e: any) {
                    return `Failed to list files: ${e.message}`;
                }
            },
        }),

        install_package: (tool as any)({
            description: 'Install a Python package via pip in the sandbox.',
            inputSchema: z.object({
                package: z.string().describe('Package name e.g. tensorflow or opencv-python'),
            }),
            execute: async ({ package: pkg }: any) => {
                if (shouldBlockFurtherTools(ctx)) return TOOL_BLOCKED_MESSAGE;

                const cid = conversationKey(ctx);
                writer.status('sandbox_start', `Installing ${pkg}...`, { tool: 'install_package' }, state.thoughtProcess);
                try {
                    await codeExecutor.installPackage(cid, pkg || '', (type, line) => {
                        writer.codeOutput(type, line);
                    });
                    writer.status('sandbox_success', `${pkg} installed`, { tool: 'install_package' }, state.thoughtProcess);
                    return `Package ${pkg} installed successfully.`;
                } catch (e: any) {
                    writer.status('sandbox_error', `Install failed: ${e.message}`, { tool: 'install_package' }, state.thoughtProcess);
                    return `Install failed: ${e.message}`;
                }
            },
        }),

        edit_file: (tool as any)({
            description:
                'Surgically edit a file by replacing the FIRST occurrence of old_str with new_str. ALWAYS read_file first to see the full content. Include enough surrounding context in old_str to make it unique. PREFER edit_file over write_file for targeted changes — only use write_file for entirely new files.',
            inputSchema: z.object({
                path: z.string().describe('File path'),
                old_str: z.string().describe('EXACT string to replace (must be unique)'),
                new_str: z.string().describe('Replacement string'),
            }),
            execute: async ({ path, old_str, new_str }: any) => {
                if (shouldBlockFurtherTools(ctx)) return TOOL_BLOCKED_MESSAGE;

                const cid = conversationKey(ctx);
                const filename = path.split('/').pop() || 'file';
                const addedLines = (new_str?.match(/\n/g) || []).length;
                const removedLines = (old_str?.match(/\n/g) || []).length;
                const diff = {
                    path,
                    old_str: old_str.slice(0, 120),
                    new_str: new_str.slice(0, 120),
                    diffAdded: addedLines,
                    diffRemoved: removedLines,
                };
                writer.status('generating_file', `Editing ${filename}...`, diff, state.thoughtProcess);
                try {
                    const result = await codeExecutor.editFile(cid, path, old_str || '', new_str || '');
                    if (result.success) {
                        writer.status('generating_file_success', `Edited ${filename}`, diff, state.thoughtProcess);
                        return `File ${path} edited successfully. After editing code, call run_bash to re-compile and re-run to verify the fix.`;
                    }
                    writer.status('generating_file_error', `Edit failed on ${filename}: ${result.error}`, { path }, state.thoughtProcess);
                    return `Edit failed: ${result.error} -- read the file and try edit_file again with more surrounding context so the old_str is unique.`;
                } catch (e: any) {
                    writer.status('generating_file_error', `Edit failed on ${filename}: ${e.message}`, { path }, state.thoughtProcess);
                    return `Edit failed: ${e.message}`;
                }
            },
        }),

        get_generated_file: (tool as any)({
            description:
                'Download a file from the sandbox and return its base64-encoded content with MIME type. Use this to return files (images, PDFs, CSVs, code files, edited documents) directly to the user in chat. Call this AFTER you finish editing or generating a file the user should receive.',
            inputSchema: z.object({
                path: z.string().describe(
                    'Absolute path to the file in the sandbox. For edited files use /home/user/edits/<filename>, for originals use /home/user/uploads/<filename>, for new files use /home/user/<filename>.',
                ),
            }),
            execute: async ({ path }: any) => {
                const cid = conversationKey(ctx);
                const filename = path.split('/').pop() || 'file';
                writer.status('generating_file', `Delivering ${filename}...`, { path, filename }, state.thoughtProcess);
                try {
                    const { base64, mimeType } = await codeExecutor.getGeneratedFile(cid, path);
                    writer.file({
                        filename,
                        path,
                        mime: mimeType,
                        base64,
                        downloadUrl: `/api/sandbox/download/${cid}/${filename}`,
                    });
                    writer.status(
                        'generating_file_success',
                        `Delivered ${filename}`,
                        { path, filename, mime: mimeType },
                        state.thoughtProcess,
                    );
                    return `File "${filename}" (${mimeType}, ${Math.round((base64.length * 0.75) / 1024)}KB) has been sent to the user. Download URL: /api/sandbox/download/${cid}/${filename}`;
                } catch (e: any) {
                    writer.status(
                        'generating_file_error',
                        `Failed to deliver ${path.split('/').pop() || 'file'}: ${e.message}`,
                        { path, error: e.message },
                        state.thoughtProcess,
                    );
                    return `Failed to get file: ${e.message}`;
                }
            },
        }),
    };
}
