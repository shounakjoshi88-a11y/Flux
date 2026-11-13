export function openAICompatAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: { message: 'Authentication required', type: 'auth_error' } });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ error: { message: 'Invalid authentication token', type: 'auth_error' } });
  }

  const validKeys = (process.env.OPENCODE_API_KEYS || '').split(',').map((k: string) => k.trim()).filter(Boolean);
  if (validKeys.length > 0 && !validKeys.includes(token)) {
    return res.status(401).json({ error: { message: 'Invalid API key', type: 'auth_error' } });
  }

  next();
}
