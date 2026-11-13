import { google } from 'googleapis';
import * as crypto from 'crypto';
import { prisma } from './db/prisma';

const OAUTH_STATE_TTL = 10 * 60 * 1000;
const oauthStateStore = new Map<string, { userId: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStateStore) {
    if (value.expiresAt < now) oauthStateStore.delete(key);
  }
}, 60_000);

function getOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || undefined,
  );
}

function getRedirectUri(req: any): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) return `${proto}://${host}/api/integrations/google/callback`;
  const fallback = process.env.GOOGLE_REDIRECT_URI;
  if (fallback) return fallback;
  return 'https://localhost:3000/api/integrations/google/callback';
}

export async function getValidToken(userId: string): Promise<{ accessToken: string; email?: string | null } | null> {
  const token = await prisma.userGoogleToken.findUnique({ where: { userId } });
  if (!token) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken ?? undefined,
    expiry_date: token.expiresAt?.getTime() ?? undefined,
  });

  if (token.expiresAt && token.expiresAt.getTime() - 5 * 60 * 1000 < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await prisma.userGoogleToken.update({
        where: { userId },
        data: {
          accessToken: credentials.access_token!,
          refreshToken: credentials.refresh_token ?? undefined,
          expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        },
      });
      return { accessToken: credentials.access_token!, email: token.email };
    } catch (err) {
      console.error('[GOOGLE] Token refresh failed:', err);
      return null;
    }
  }

  return { accessToken: token.accessToken, email: token.email };
}

export function getAuthenticatedClient(accessToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
  };
}

export async function initGoogleAuth(req: any, res: any) {
  try {
    const uid = req.appUserId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('[GOOGLE] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars');
      return res.status(500).json({ error: 'Google OAuth is not configured on the server' });
    }

    const state = crypto.randomUUID();
    oauthStateStore.set(state, { userId: uid, expiresAt: Date.now() + OAUTH_STATE_TTL });

    const redirectUri = getRedirectUri(req);
    console.log('[GOOGLE] Init redirect URI:', redirectUri);
    const oauth2Client = getOAuth2Client(redirectUri);
    const scopes = (
      process.env.GOOGLE_SCOPES ||
      'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly'
    ).split(' ').filter(Boolean);

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      prompt: 'consent',
    });

    res.json({ url });
  } catch (err) {
    const msg = (err as any)?.message || 'Unknown error';
    console.error('[GOOGLE] Init error:', msg);
    res.status(500).json({ error: `Failed to initialize Google auth: ${msg}` });
  }
}

export async function handleGoogleCallback(req: any, res: any) {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.send(oauthResultHtml(false, 'Missing code or state'));
    }

    const stateData = oauthStateStore.get(state as string);
    if (!stateData || stateData.expiresAt < Date.now()) {
      oauthStateStore.delete(state as string);
      return res.send(oauthResultHtml(false, 'Invalid or expired state'));
    }
    oauthStateStore.delete(state as string);

    const redirectUri = getRedirectUri(req);
    const oauth2Client = getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code as string);

    if (!tokens.access_token) {
      return res.send(oauthResultHtml(false, 'No access token received'));
    }

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const email = userInfo.email || '';

    await prisma.userGoogleToken.upsert({
      where: { userId: stateData.userId },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        scope: tokens.scope || '',
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        email,
      },
      create: {
        userId: stateData.userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope || '',
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        email,
      },
    });

    res.send(oauthResultHtml(true, email));
  } catch (err) {
    console.error('[GOOGLE] Callback error:', err);
    res.send(oauthResultHtml(false, 'Authentication failed'));
  }
}

export async function getGoogleStatus(req: any, res: any) {
  try {
    const uid = req.appUserId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const token = await prisma.userGoogleToken.findUnique({ where: { userId: uid } });
    res.json({
      connected: !!token,
      email: token?.email || null,
    });
  } catch (err) {
    console.error('[GOOGLE] Status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
}

export async function disconnectGoogle(req: any, res: any) {
  try {
    const uid = req.appUserId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    await prisma.userGoogleToken.deleteMany({ where: { userId: uid } });
    res.json({ success: true });
  } catch (err) {
    console.error('[GOOGLE] Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
}

function oauthResultHtml(success: boolean, data: string): string {
  const safeData = data.replace(/'/g, "\\'");
  return `<!DOCTYPE html><html><body><script>
if (window.opener) {
  window.opener.postMessage({ type: 'google-oauth-success', success: ${success}, ${success ? `email: '${safeData}'` : `error: '${safeData}'`} }, '*');
}
window.close();
<\/script></body></html>`;
}
