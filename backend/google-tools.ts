import { tool } from 'ai';
import { z } from 'zod';
import { getValidToken, getAuthenticatedClient } from './google-auth';

function sendStatus(res: any, subtype: string, message: string) {
  if (res.writableEnded) return;
  res.write(`event: status\ndata: ${JSON.stringify({ type: "status", subtype, message, data: null })}\n\n`);
}

function extractHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return '[Unable to decode]';
  }
}

function getEmailBody(payload: any): string {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      if (part.parts) {
        const nested = getEmailBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function makeMimeEmail(to: string, subject: string, body: string): string {
  const boundary = '----boundary_' + Date.now().toString(36);
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    '',
    `--${boundary}--`,
  ];
  return lines.join('\r\n');
}

export function createGoogleTools(uid: string | undefined, res: any, _state: any) {
  if (!uid) {
    const notConnected = () => 'Connect your Google account first. Go to Settings \u2192 Integrations \u2192 Connect Google.';
    return {
      gmail_search: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ query: z.string() }),
        execute: notConnected,
      }),
      gmail_read: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ messageId: z.string() }),
        execute: notConnected,
      }),
      gmail_send: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
        execute: notConnected,
      }),
      gmail_list_threads: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ maxResults: z.number().optional() }),
        execute: notConnected,
      }),
      calendar_list_events: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ maxResults: z.number().optional(), timeMin: z.string().optional(), timeMax: z.string().optional() }),
        execute: notConnected,
      }),
      calendar_create_event: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ summary: z.string(), startTime: z.string(), endTime: z.string(), description: z.string().optional(), attendees: z.array(z.string()).optional() }),
        execute: notConnected,
      }),
      drive_search_files: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ query: z.string(), pageSize: z.number().optional() }),
        execute: notConnected,
      }),
      drive_read_file: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ fileId: z.string() }),
        execute: notConnected,
      }),
      drive_list_folder: (tool as any)({
        description: 'NOT CONNECTED',
        inputSchema: z.object({ folderId: z.string().optional() }),
        execute: notConnected,
      }),
    };
  }

  async function withGoogleAuth<T>(fn: (clients: ReturnType<typeof getAuthenticatedClient>) => Promise<T>): Promise<T | string> {
    if (!uid) return 'You are not authenticated.';
    const token = await getValidToken(uid);
    if (!token) return 'Your Google connection expired or is invalid. Go to Settings \u2192 Integrations \u2192 Reconnect Google.';
    try {
      return await fn(getAuthenticatedClient(token.accessToken));
    } catch (err: any) {
      console.error('[GOOGLE TOOL] Error:', err);
      const msg = err?.errors?.[0]?.message || err?.message || 'Unknown Google API error';
      if (msg.includes('Not Found')) return `Error: ${msg}. The resource may have been deleted or you may not have access.`;
      if (msg.includes('Rate Limit') || msg.includes('quota')) return `Error: ${msg}. Please try again later.`;
      return `Google API error: ${msg}`;
    }
  }

  return {
    gmail_search: (tool as any)({
      description: 'Search your Gmail inbox for emails matching a query. Returns matching messages with subject, sender, date, and snippet.',
      inputSchema: z.object({
        query: z.string().describe('Gmail search query (same syntax as Gmail search bar, e.g. "from:john subject:meeting after:2024/1/1")'),
        maxResults: z.number().optional().describe('Maximum number of results to return (default 10, max 50)'),
      }),
      execute: async ({ query, maxResults }: any) => {
        sendStatus(res, 'gmail', `Searching Gmail for "${query}"...`);
        return withGoogleAuth(async ({ gmail }) => {
          const listRes = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: Math.min(maxResults || 10, 50),
          });
          const messages = listRes.data.messages || [];
          if (messages.length === 0) return 'No emails found matching your query.';

          const results: string[] = [];
          for (const msg of messages.slice(0, 10)) {
            const detail = await gmail.users.messages.get({
              userId: 'me', id: msg.id!, format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'Date'],
            });
            const headers = detail.data.payload?.headers || [];
            results.push(
              `- **${extractHeader(headers, 'Subject') || '(no subject)'}**\n` +
              `  From: ${extractHeader(headers, 'From')}\n` +
              `  Date: ${extractHeader(headers, 'Date')}\n` +
              `  ID: ${msg.id}\n` +
              `  Snippet: ${detail.data.snippet || ''}`
            );
          }

          return `Found ${messages.length} email(s):\n\n${results.join('\n\n')}`;
        });
      },
    }),

    gmail_read: (tool as any)({
      description: 'Read the full content and metadata of a specific email by its Gmail message ID.',
      inputSchema: z.object({
        messageId: z.string().describe('The Gmail message ID (from gmail_search or gmail_list_threads results)'),
      }),
      execute: async ({ messageId }: any) => {
        sendStatus(res, 'gmail', 'Reading email...');
        return withGoogleAuth(async ({ gmail }) => {
          const detail = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
          const headers = detail.data.payload?.headers || [];
          const subject = extractHeader(headers, 'Subject') || '(no subject)';
          const from = extractHeader(headers, 'From');
          const to = extractHeader(headers, 'To');
          const date = extractHeader(headers, 'Date');
          const cc = extractHeader(headers, 'Cc');
          const bodyText = getEmailBody(detail.data.payload!);

          let result = `## ${subject}\n\n**From:** ${from}\n**To:** ${to}\n**Date:** ${date}\n`;
          if (cc) result += `**CC:** ${cc}\n`;
          result += `\n---\n\n${bodyText || '*[No plain text content]*'}`;
          return result;
        });
      },
    }),

    gmail_send: (tool as any)({
      description: 'Compose and send an email via your Gmail account.',
      inputSchema: z.object({
        to: z.string().describe('Recipient email address(es), comma-separated for multiple'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body text (plain text)'),
      }),
      execute: async ({ to, subject, body }: any) => {
        sendStatus(res, 'gmail', `Sending email to ${to}...`);
        return withGoogleAuth(async ({ gmail }) => {
          const mimeMsg = makeMimeEmail(to, subject, body);
          const encoded = Buffer.from(mimeMsg).toString('base64url');
          await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
          return `Email sent successfully to ${to} with subject "${subject}".`;
        });
      },
    }),

    gmail_list_threads: (tool as any)({
      description: 'List recent email threads in your Gmail inbox.',
      inputSchema: z.object({
        maxResults: z.number().optional().describe('Maximum number of threads to return (default 20, max 50)'),
        query: z.string().optional().describe('Optional search filter (same as Gmail search)'),
      }),
      execute: async ({ maxResults, query }: any) => {
        sendStatus(res, 'gmail', 'Fetching inbox threads...');
        return withGoogleAuth(async ({ gmail }) => {
          const listRes = await gmail.users.threads.list({
            userId: 'me',
            maxResults: Math.min(maxResults || 20, 50),
            q: query || undefined,
          });
          const threads = listRes.data.threads || [];
          if (threads.length === 0) return 'No threads found.';

          const results: string[] = [];
          for (const thread of threads.slice(0, 20)) {
            const detail = await gmail.users.threads.get({
              userId: 'me', id: thread.id!, format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'Date'],
            });
            const firstMsg = detail.data.messages?.[0];
            const headers = firstMsg?.payload?.headers || [];
            const msgCount = detail.data.messages?.length || 1;
            results.push(
              `- **${extractHeader(headers, 'Subject') || '(no subject)'}** (${msgCount} message${msgCount > 1 ? 's' : ''})\n` +
              `  From: ${extractHeader(headers, 'From')}\n` +
              `  Latest: ${extractHeader(headers, 'Date')}\n` +
              `  Thread ID: ${thread.id}\n` +
              `  Snippet: ${firstMsg?.snippet || ''}`
            );
          }

          return `Found ${threads.length} thread(s):\n\n${results.join('\n\n')}`;
        });
      },
    }),

    calendar_list_events: (tool as any)({
      description: 'List upcoming events from your Google Calendar.',
      inputSchema: z.object({
        maxResults: z.number().optional().describe('Maximum number of events to return (default 20, max 100)'),
        timeMin: z.string().optional().describe('Start of time range in ISO 8601 format (default: now)'),
        timeMax: z.string().optional().describe('End of time range in ISO 8601 format'),
      }),
      execute: async ({ maxResults, timeMin, timeMax }: any) => {
        sendStatus(res, 'calendar', 'Fetching calendar events...');
        return withGoogleAuth(async ({ calendar }) => {
          const eventsRes = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin || new Date().toISOString(),
            timeMax: timeMax || undefined,
            maxResults: Math.min(maxResults || 20, 100),
            singleEvents: true,
            orderBy: 'startTime',
          });
          const events = eventsRes.data.items || [];
          if (events.length === 0) return 'No upcoming events found.';

          const results = events.map((event: any) => {
            const start = event.start?.dateTime || event.start?.date || 'No date';
            const end = event.end?.dateTime || event.end?.date || '';
            return `- **${event.summary || '(Untitled)'}**\n` +
              `  When: ${start}${end ? ` \u2192 ${end}` : ''}\n` +
              `  ${event.description ? `Description: ${event.description.slice(0, 200)}` : ''}` +
              (event.location ? `\n  Location: ${event.location}` : '') +
              (event.attendees?.length ? `\n  Attendees: ${event.attendees.map((a: any) => a.email).join(', ')}` : '');
          });

          return `Upcoming events:\n\n${results.join('\n\n')}`;
        });
      },
    }),

    calendar_create_event: (tool as any)({
      description: 'Create a new event on your Google Calendar.',
      inputSchema: z.object({
        summary: z.string().describe('Event title'),
        startTime: z.string().describe('Start time in ISO 8601 format (e.g. "2025-06-15T14:00:00")'),
        endTime: z.string().describe('End time in ISO 8601 format (e.g. "2025-06-15T15:00:00")'),
        description: z.string().optional().describe('Optional event description'),
        attendees: z.array(z.string()).optional().describe('Optional list of attendee email addresses'),
      }),
      execute: async ({ summary, startTime, endTime, description, attendees }: any) => {
        sendStatus(res, 'calendar', `Creating event "${summary}"...`);
        return withGoogleAuth(async ({ calendar }) => {
          const event: any = {
            summary,
            start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          };
          if (description) event.description = description;
          if (attendees?.length) {
            event.attendees = attendees.map((email: string) => ({ email }));
          }

          const created = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
          return `Event created successfully!\n**${summary}**\nWhen: ${startTime} \u2192 ${endTime}\n${description ? `Description: ${description}\n` : ''}${attendees?.length ? `Attendees: ${attendees.join(', ')}\n` : ''}Link: ${created.data.htmlLink || 'N/A'}`;
        });
      },
    }),

    drive_search_files: (tool as any)({
      description: 'Search your Google Drive for files matching a query.',
      inputSchema: z.object({
        query: z.string().describe('Search query (e.g. "contract", "name contains \'report\'", "mimeType=\'application/pdf\'")'),
        pageSize: z.number().optional().describe('Maximum results (default 10, max 50)'),
      }),
      execute: async ({ query, pageSize }: any) => {
        sendStatus(res, 'drive', `Searching Drive for "${query}"...`);
        return withGoogleAuth(async ({ drive }) => {
          const filesRes = await drive.files.list({
            q: `name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}'`,
            pageSize: Math.min(pageSize || 10, 50),
            fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
            orderBy: 'modifiedTime desc',
          });
          const files = filesRes.data.files || [];
          if (files.length === 0) return 'No files found matching your query.';

          const results = files.map((f: any) => {
            const sizeStr = f.size ? ` (${(Number(f.size) / 1024).toFixed(0)} KB)` : '';
            return `- **${f.name}**${sizeStr}\n  Type: ${f.mimeType}\n  Modified: ${f.modifiedTime || 'N/A'}\n  ID: ${f.id}\n  Link: ${f.webViewLink || 'N/A'}`;
          });

          return `Found ${files.length} file(s):\n\n${results.join('\n\n')}`;
        });
      },
    }),

    drive_read_file: (tool as any)({
      description: 'Read the content or metadata of a file from Google Drive.',
      inputSchema: z.object({
        fileId: z.string().describe('The Google Drive file ID (from drive_search_files or drive_list_folder results)'),
      }),
      execute: async ({ fileId }: any) => {
        sendStatus(res, 'drive', 'Reading file...');
        return withGoogleAuth(async ({ drive }) => {
          const meta = await drive.files.get({ fileId, fields: 'id,name,mimeType,size,modifiedTime,webViewLink,description' });
          const mimeType = meta.data.mimeType || '';

          const exportableMimes: Record<string, string> = {
            'application/vnd.google-apps.document': 'text/plain',
            'application/vnd.google-apps.spreadsheet': 'text/csv',
            'application/vnd.google-apps.presentation': 'text/plain',
            'application/vnd.google-apps.drawing': 'text/plain',
          };

          let content = '';
          if (exportableMimes[mimeType]) {
            try {
              const exportRes = await drive.files.export({ fileId, mimeType: exportableMimes[mimeType] as string });
              content = typeof exportRes.data === 'string' ? exportRes.data : JSON.stringify(exportRes.data);
            } catch {
              content = '[Could not export this file format]';
            }
          } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
            const fileRes = await drive.files.get({ fileId, alt: 'media' });
            content = typeof fileRes.data === 'string' ? fileRes.data : JSON.stringify(fileRes.data);
          } else {
            content = `[Binary file: ${mimeType}, ${meta.data.size ? `${(Number(meta.data.size) / 1024).toFixed(0)} KB` : 'size unknown'}]`;
          }

          const sizeStr = meta.data.size ? `${(Number(meta.data.size) / 1024).toFixed(0)} KB` : 'Unknown';
          let result = `## ${meta.data.name}\n**Type:** ${mimeType}\n**Size:** ${sizeStr}\n**Modified:** ${meta.data.modifiedTime || 'N/A'}\n`;
          if (meta.data.description) result += `**Description:** ${meta.data.description}\n`;
          if (meta.data.webViewLink) result += `**Link:** ${meta.data.webViewLink}\n`;
          result += `\n---\n\n${content}`;

          return result.slice(0, 50_000);
        });
      },
    }),

    drive_list_folder: (tool as any)({
      description: 'List files and folders inside a specific Google Drive folder (or root if no folderId provided).',
      inputSchema: z.object({
        folderId: z.string().optional().describe('The folder ID to list contents of (omit to list root)'),
      }),
      execute: async ({ folderId }: any) => {
        sendStatus(res, 'drive', 'Listing folder contents...');
        return withGoogleAuth(async ({ drive }) => {
          const q = folderId
            ? `'${folderId}' in parents and trashed=false`
            : `'root' in parents and trashed=false`;
          const filesRes = await drive.files.list({
            q,
            pageSize: 50,
            fields: 'files(id,name,mimeType,size,modifiedTime)',
            orderBy: 'folder,name',
          });
          const files = filesRes.data.files || [];
          if (files.length === 0) return 'The folder is empty.';

          const folders = files.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');
          const items = files.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');

          let result = '';
          if (folders.length) {
            result += `**Folders (${folders.length}):**\n` + folders.map((f: any) => `- 📁 ${f.name} (ID: ${f.id})`).join('\n') + '\n\n';
          }
          if (items.length) {
            result += `**Files (${items.length}):**\n` + items.map((f: any) => {
              const sizeStr = f.size ? ` (${(Number(f.size) / 1024).toFixed(0)} KB)` : '';
              return `- ${f.name}${sizeStr} — ${f.mimeType} (ID: ${f.id})`;
            }).join('\n');
          }

          return result;
        });
      },
    }),
  };
}
