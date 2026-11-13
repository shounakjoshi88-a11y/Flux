/**
 * Code execution tools: run_python and run_bash.
 *
 * Both run in the conversation's sandbox and stream their output back to the
 * client as it arrives: code_execution first (so the UI has a container before
 * any output), then code_output lines, then code_done, then file_generated for
 * each file the run produced.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { codeExecutor } from '../../sandbox/executor';
import { conversationKey } from './context';
import type { ToolContext } from './context';

/** Shared tail of both tools: publish the files a run produced. */
async function publishGeneratedFiles(ctx: ToolContext, cid: string, filePaths: string[]): Promise<void> {
    const { writer } = ctx;
    for (const filePath of filePaths) {
        const filename = filePath.split('/').pop() || 'output';
        const downloadUrl = `/api/sandbox/download/${cid}/${filename}`;
        try {
            const { base64, mimeType } = await codeExecutor.getGeneratedFile(cid, filePath);
            writer.fileGenerated({ filename, path: filePath, mime: mimeType, base64, downloadUrl });
        } catch {
            writer.fileGenerated({ filename, path: filePath, downloadUrl });
        }
    }
}

/** The stdout/stderr block handed back to the model, truncated to keep the context sane. */
function formatRunResult(result: {
    exitCode: number;
    duration: number;
    stdout: string[];
    stderr: string[];
    generatedFiles: string[];
    error?: string;
}): string {
    const outFull = result.stdout.join('\n');
    const errFull = result.stderr.join('\n');
    const out = outFull.slice(0, 4000);
    const err = errFull.slice(0, 2000);
    const outTruncated = outFull.length > 4000 ? '\n[output truncated]' : '';
    const errTruncated = errFull.length > 2000 ? '\n[output truncated]' : '';
    return (
        `Exit code: ${result.exitCode} (${(result.duration / 1000).toFixed(1)}s)\n` +
        `${out ? `STDOUT:\n${out}${outTruncated}\n` : ''}` +
        `${err ? `STDERR:\n${err}${errTruncated}\n` : ''}` +
        `${result.generatedFiles.length ? `Generated files: ${result.generatedFiles.join(', ')} (sent to user)\n` : ''}` +
        `${result.error ? `Error: ${result.error}` : ''}`
    );
}

export function createExecTools(ctx: ToolContext) {
    const { writer, state, abortSignal } = ctx;

    return {
        run_python: (tool as any)({
            description:
                'Execute Python code in an isolated sandbox. Use for data analysis, visualization, file processing, calculations. Has pandas, numpy, matplotlib, seaborn, plotly, scipy, scikit-learn pre-installed.',
            inputSchema: z.object({
                code: z.string().describe('Complete, runnable Python code to execute'),
            }),
            execute: async ({ code }: any) => {
                // Post-search guard: if the model already has search results, it should answer, not run code.
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ You already have substantial search results from 3 searches. ANSWER THE USER NOW using the accumulated information. Do NOT call any more tools.';
                }
                const cid = conversationKey(ctx);
                // code_execution first so streaming output lines have a visible container.
                writer.codeExecution(code || '', 'python');
                writer.status('sandbox_start', 'Starting Python execution...', { tool: 'run_python' }, state.thoughtProcess);
                try {
                    const result = await codeExecutor.runPython(
                        cid,
                        code || '',
                        (type, line) => writer.codeOutput(type, line),
                        abortSignal,
                    );
                    writer.codeDone(result.exitCode, result.duration);
                    await publishGeneratedFiles(ctx, cid, result.generatedFiles);
                    writer.status(
                        'sandbox_success',
                        `Python finished (exit ${result.exitCode}, ${(result.duration / 1000).toFixed(1)}s)`,
                        {
                            tool: 'run_python',
                            exitCode: result.exitCode,
                            code,
                            stdout: result.stdout.join('\n'),
                            stderr: result.stderr.join('\n'),
                            duration: result.duration,
                        },
                        state.thoughtProcess,
                    );
                    return formatRunResult(result);
                } catch (e: any) {
                    writer.status(
                        'sandbox_error',
                        `Python execution failed: ${e.message}`,
                        { tool: 'run_python', code, error: e.message },
                        state.thoughtProcess,
                    );
                    return `Python execution failed: ${e.message}`;
                }
            },
        }),

        run_bash: (tool as any)({
            description:
                'Run a bash command in the sandbox. Used for compiling/running code (gcc, python3, node, etc.), running linters/type-checkers, and file operations. NEVER run "which", "echo", "ls", "cd", "pwd", "type", "--version", or install packages — the sandbox already has everything pre-installed. After write_file creates a code file, call this to compile and test it.',
            inputSchema: z.object({
                command: z.string().describe('Bash command to execute'),
            }),
            execute: async ({ command }: any) => {
                if (state.searchCount >= 2 && (state.searchContent?.length ?? 0) > 100) {
                    return '__TOOL_BLOCKED__ ANSWER THE USER NOW. You already have detailed search results from earlier searches. Do NOT call any more tools.';
                }
                const cid = conversationKey(ctx);
                writer.codeExecution(command || '', 'bash');
                writer.status('sandbox_start', `$ ${(command || '').slice(0, 80)}`, { tool: 'run_bash', command }, state.thoughtProcess);
                try {
                    const result = await codeExecutor.runBash(
                        cid,
                        command || '',
                        (type, line) => writer.codeOutput(type, line),
                        abortSignal,
                    );
                    writer.codeDone(result.exitCode, result.duration);
                    await publishGeneratedFiles(ctx, cid, result.generatedFiles);
                    writer.status(
                        'sandbox_success',
                        `Bash finished (exit ${result.exitCode}, ${(result.duration / 1000).toFixed(1)}s)`,
                        {
                            tool: 'run_bash',
                            exitCode: result.exitCode,
                            command,
                            stdout: result.stdout.join('\n'),
                            stderr: result.stderr.join('\n'),
                            duration: result.duration,
                        },
                        state.thoughtProcess,
                    );
                    return formatRunResult(result);
                } catch (e: any) {
                    writer.status(
                        'sandbox_error',
                        `Bash failed: ${e.message}`,
                        { tool: 'run_bash', command, error: e.message },
                        state.thoughtProcess,
                    );
                    return `Bash failed: ${e.message}`;
                }
            },
        }),
    };
}
