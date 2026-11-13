/**
 * Per-tool timeouts.
 *
 * A tool that hangs must not hang the whole response: each one gets a budget
 * and, when it runs out, the call rejects with a timeout error instead of
 * leaving the stream open forever.
 */

/** Budgets in milliseconds. Tools not listed here are not limited. */
export const TOOL_TIMEOUTS: Record<string, number> = {
    web_search: 30_000,
    read_skill: 10_000,
    generate_document: 60_000,
    get_weather: 10_000,
    generate_image: 90_000,
    wiki_search: 10_000,
    read_url: 10_000,
    run_bash: 60_000,
    run_python: 60_000,
    shell_execute: 30_000,
    create_project: 30_000,
    start_app: 30_000,
    stop_app: 10_000,
    list_apps: 10_000,
    get_app_logs: 10_000,
    get_app_url: 10_000,
    get_generated_file: 10_000,
    file_list: 10_000,
    file_read: 10_000,
    file_write: 10_000,
    gmail_search: 30_000,
    gmail_read: 30_000,
    gmail_send: 30_000,
    gmail_list_threads: 30_000,
    calendar_list_events: 30_000,
    calendar_create_event: 30_000,
    drive_search_files: 30_000,
    drive_read_file: 30_000,
    drive_list_folder: 30_000,
};

/**
 * Wrap each tool's execute with a hard timeout.
 * Graceful degradation: the call rejects with a readable message.
 */
export function withToolTimeout(tools: Record<string, any>, timeouts: Record<string, number>): void {
    for (const [name, timeoutMs] of Object.entries(timeouts)) {
        const tool = tools[name];
        if (!tool || !tool.execute || typeof tool.execute !== 'function') continue;
        const originalExecute = tool.execute;
        tool.execute = async (args: any) => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => {
                ctrl.abort();
            }, timeoutMs);
            try {
                return await Promise.race([
                    originalExecute(args),
                    new Promise<never>((_, reject) =>
                        ctrl.signal.addEventListener('abort', () =>
                            reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)),
                        ),
                    ),
                ]);
            } finally {
                clearTimeout(timer);
            }
        };
    }
}
