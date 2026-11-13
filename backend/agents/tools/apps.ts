/**
 * Background app tools.
 *
 * `create_project` scaffolds a directory in the conversation's sandbox; the
 * rest start, inspect and stop long-running processes and expose their public
 * preview URL. Everything routes through `codeExecutor`, so the sandbox
 * provider stays replaceable.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { codeExecutor } from '../../tools/codeExecutor';
import { conversationKey, shouldBlockFurtherTools, TOOL_BLOCKED_MESSAGE } from './context';
import type { ToolContext } from './context';

export function createAppTools(ctx: ToolContext) {
    const { writer, state } = ctx;

    return {
        create_project: (tool as any)({
            description:
                'Scaffold a full project directory with files in the sandbox. Use this when building a complete app (HTML/CSS/JS, React, Python web app, etc.). Provide the project name and an array of { path, content } objects.',
            inputSchema: z.object({
                name: z.string().describe('Project name (folder name under /home/user)'),
                files: z
                    .array(
                        z.object({
                            path: z.string().describe('Relative file path within the project, e.g. src/index.js'),
                            content: z.string().describe('Full file content'),
                        }),
                    )
                    .describe('Array of files to create in the project'),
            }),
            execute: async ({ name, files }: any) => {
                if (shouldBlockFurtherTools(ctx)) return TOOL_BLOCKED_MESSAGE;

                const cid = conversationKey(ctx);
                const projectDir = `/home/user/${name}`;
                writer.status('generating_file', `Scaffolding project "${name}"...`, { name }, state.thoughtProcess);
                try {
                    await codeExecutor.runBash(cid, `mkdir -p ${projectDir}`);
                    let created = 0;
                    for (const f of files || []) {
                        const fullPath = f.path.startsWith('/') ? f.path : `${projectDir}/${f.path}`;
                        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
                        await codeExecutor.runBash(cid, `mkdir -p ${dir}`);
                        await codeExecutor.writeFile(cid, fullPath, f.content || '');
                        created++;
                    }
                    writer.status(
                        'generating_file_success',
                        `Project "${name}" created with ${created} files.`,
                        { name, created },
                        state.thoughtProcess,
                    );
                    return `Project "${name}" created with ${created} files at ${projectDir}`;
                } catch (e: any) {
                    writer.status(
                        'generating_file_error',
                        `Failed to create project "${name}": ${e.message}`,
                        { name },
                        state.thoughtProcess,
                    );
                    return `Failed to create project: ${e.message}`;
                }
            },
        }),

        start_app: (tool as any)({
            description:
                'Start a long-running background process (web server, dev server, API) in the sandbox. Use this after creating project files with create_project or write_file. The process runs in the background — use stop_app to kill it and get_app_url for the public URL.',
            inputSchema: z.object({
                name: z.string().describe('A human-readable name for this app/process'),
                command: z.string().describe('The command to run (e.g. "python3 app.py", "npm start", "node server.js")'),
                cwd: z.string().optional().describe('Working directory (default: /home/user)'),
                port: z
                    .number()
                    .optional()
                    .describe('The port the app listens on (e.g. 3000, 8000, 5000). Required for get_app_url to work.'),
            }),
            execute: async ({ name, command, cwd, port }: any) => {
                const cid = conversationKey(ctx);
                writer.status('sandbox_start', `Launching app "${name}"...`, { name, command, port }, state.thoughtProcess);
                try {
                    const app = await codeExecutor.startApp(cid, name || 'app', command, cwd || '/home/user', port);
                    writer.status(
                        'sandbox_success',
                        `App "${name}" launched on port ${port || 'auto'}`,
                        { name, app_id: app.id },
                        state.thoughtProcess,
                    );
                    return `App "${app.name}" started (ID: ${app.id})${port ? ` on port ${port}` : ''}. Use get_app_url with ID "${app.id}" to get the public URL, and stop_app to stop it.`;
                } catch (e: any) {
                    writer.status('sandbox_error', `Failed to launch app "${name}": ${e.message}`, { name }, state.thoughtProcess);
                    return `Failed to start app: ${e.message}`;
                }
            },
        }),

        stop_app: (tool as any)({
            description: 'Stop a running background app by its ID (returned by start_app).',
            inputSchema: z.object({
                app_id: z.string().describe('The app ID returned by start_app'),
            }),
            execute: async ({ app_id }: any) => {
                const cid = conversationKey(ctx);
                try {
                    const stopped = await codeExecutor.stopApp(cid, app_id);
                    return stopped ? `App ${app_id} stopped.` : `App ${app_id} not found.`;
                } catch (e: any) {
                    return `Failed to stop app: ${e.message}`;
                }
            },
        }),

        list_apps: (tool as any)({
            description: 'List all running background apps in the current sandbox session.',
            inputSchema: z.object({}),
            execute: async () => {
                const cid = conversationKey(ctx);
                const apps = codeExecutor.listApps(cid);
                if (!apps.length) return 'No running apps.';
                return apps
                    .map(
                        (a) =>
                            `  ID: ${a.id} | Name: ${a.name} | Command: ${a.command} | CWD: ${a.cwd} | Port: ${a.port || '-'} | Started: ${new Date(a.startedAt).toLocaleTimeString()}`,
                    )
                    .join('\n');
            },
        }),

        get_app_logs: (tool as any)({
            description:
                'Get the stdout/stderr output from a running or finished app. Returns whatever output has been buffered so far.',
            inputSchema: z.object({
                app_id: z.string().describe('The app ID returned by start_app'),
            }),
            execute: async ({ app_id }: any) => {
                const cid = conversationKey(ctx);
                try {
                    const logs = await codeExecutor.getAppLogs(cid, app_id);
                    let result = '';
                    if (logs.stdout) result += `STDOUT:\n${logs.stdout}\n`;
                    if (logs.stderr) result += `STDERR:\n${logs.stderr}\n`;
                    return result || 'No logs available yet.';
                } catch (e: any) {
                    return `Failed to get logs: ${e.message}`;
                }
            },
        }),

        get_app_url: (tool as any)({
            description:
                'Get the public HTTPS URL for a running web app started with start_app. The app must have been started with a port number. Use this to provide the user with a clickable link to their app.',
            inputSchema: z.object({
                app_id: z.string().describe('The app ID returned by start_app'),
            }),
            execute: async ({ app_id }: any) => {
                const cid = conversationKey(ctx);
                writer.status('searching', 'Generating public preview URL...', { app_id }, state.thoughtProcess);
                try {
                    const url = await codeExecutor.getAppUrl(cid, app_id);
                    if (url) {
                        writer.status('found_sources', 'Preview ready!', { url }, state.thoughtProcess);
                        return `Your app is live at: ${url}`;
                    }
                    writer.status('error', 'App preview not ready yet.', { app_id }, state.thoughtProcess);
                    return 'App URL not yet available. The app may still be starting up or may not be listening on the expected port.';
                } catch (e: any) {
                    writer.status('error', `Failed to get preview URL: ${e.message}`, { app_id }, state.thoughtProcess);
                    return `Failed to get app URL: ${e.message}`;
                }
            },
        }),
    };
}
