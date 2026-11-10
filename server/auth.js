import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = 'sid';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored?.split(':') ?? [];
  if (!salt || !hash) return false;
  const candidate = await scryptAsync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function readSessionToken(req) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join('='));
  }
  return null;
}

function sessionCookie(token, maxAgeMs) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

export async function startSession(sessions, res, userId) {
  const token = randomBytes(32).toString('base64url');
  await sessions.insertOne({ tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) });
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_MS));
}

export async function endSession(sessions, req, res) {
  const token = readSessionToken(req);
  if (token) await sessions.deleteOne({ tokenHash: hashToken(token) });
  res.setHeader('Set-Cookie', sessionCookie('', 0));
}

export function requireUser(sessions, users) {
  return async (req, res, next) => {
    try {
      const token = readSessionToken(req);
      const session = token && await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
      const user = session && await users.findOne({ _id: session.userId }, { projection: { passwordHash: 0, 'character.sprite': 0, 'character.original': 0, 'characterDraft.sprite': 0, 'characterDraft.original': 0 } });
      if (!user) return res.status(401).json({ error: 'Not logged in' });
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
