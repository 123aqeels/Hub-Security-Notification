import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, verifyPassword } from './db.ts';

const SESSION_COOKIE_NAME = 'hpsl_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'hpsl-local-plant-intranet-secret-key-2026';
const SESSION_TTL_HOURS = 12;

export interface AuthenticatedUser {
  id: number;
  employee_id: string;
  username: string;
  full_name: string;
  email: string;
  department: string;
  phone: string;
  role_id: number;
  role_code: string;
  role_name: string;
  access_level: 'Admin' | 'Security Officer' | 'User';
  permissions: string[];
}

export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

export function logAudit(params: {
  user?: AuthenticatedUser | null;
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: string;
  req?: Request;
}) {
  const ip = params.req ? getClientIp(params.req) : '127.0.0.1';
  const ua = params.req ? String(params.req.headers['user-agent'] || '').slice(0, 200) : 'system';
  db.prepare(`
    INSERT INTO audit_logs (user_id, username, role_code, action, entity_type, entity_id, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.user?.id ?? null,
    params.user?.username ?? 'anonymous',
    params.user?.role_code ?? 'PUBLIC',
    params.action,
    params.entityType,
    String(params.entityId ?? ''),
    params.details ?? '',
    ip,
    ua
  );
}

function signToken(rawToken: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
  return `${rawToken}.${sig}`;
}

function verifySignedToken(cookieValue: string): string | null {
  const dotIdx = cookieValue.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const rawToken = cookieValue.slice(0, dotIdx);
  const sig = cookieValue.slice(dotIdx + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return rawToken;
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function loadUserWithPermissions(userId: number): AuthenticatedUser | null {
  const userRow = db.prepare(`
    SELECT u.id, u.employee_id, u.username, u.full_name, u.email, u.department, u.phone,
           u.role_id, u.is_active, r.code as role_code, r.name as role_name, r.access_level
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = ?
  `).get(userId) as (AuthenticatedUser & { is_active: number }) | undefined;

  if (!userRow || !userRow.is_active) return null;

  const permRows = db.prepare(`
    SELECT p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(userRow.role_id) as { code: string }[];

  return {
    id: userRow.id,
    employee_id: userRow.employee_id,
    username: userRow.username,
    full_name: userRow.full_name,
    email: userRow.email,
    department: userRow.department,
    phone: userRow.phone,
    role_id: userRow.role_id,
    role_code: userRow.role_code,
    role_name: userRow.role_name,
    access_level: userRow.access_level,
    permissions: permRows.map((p) => p.code),
  };
}

export function authenticateCredentials(username: string, password: string, req: Request): {
  ok: boolean;
  error?: string;
  lockedUntil?: string | null;
  user?: AuthenticatedUser;
  signedCookie?: string;
} {
  const ip = getClientIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  const cleanUsername = username.trim().toLowerCase();

  const row = db.prepare(`
    SELECT id, username, password_hash, password_salt, is_active, failed_login_attempts, locked_until
    FROM users
    WHERE lower(username) = ?
  `).get(cleanUsername) as {
    id: number;
    username: string;
    password_hash: string;
    password_salt: string;
    is_active: number;
    failed_login_attempts: number;
    locked_until: string | null;
  } | undefined;

  const recordLogin = (userId: number | null, success: boolean, reason: string | null) => {
    db.prepare(`
      INSERT INTO login_history (user_id, username_attempted, success, ip_address, user_agent, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, cleanUsername, success ? 1 : 0, ip, ua, reason);
  };

  if (!row) {
    recordLogin(null, false, 'Invalid username');
    return { ok: false, error: 'Invalid username or password.' };
  }

  if (!row.is_active) {
    recordLogin(row.id, false, 'Account deactivated');
    return { ok: false, error: 'Account is deactivated. Contact Security Administrator.' };
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    recordLogin(row.id, false, 'Account locked');
    return {
      ok: false,
      error: `Account temporarily locked due to failed attempts. Try again after ${new Date(row.locked_until).toLocaleTimeString()}.`,
      lockedUntil: row.locked_until,
    };
  }

  const valid = verifyPassword(password, row.password_hash, row.password_salt);
  if (!valid) {
    const maxAttemptsCfg = db.prepare("SELECT value FROM system_config WHERE key = 'max_failed_logins'").get() as { value: string } | undefined;
    const lockoutMinsCfg = db.prepare("SELECT value FROM system_config WHERE key = 'lockout_minutes'").get() as { value: string } | undefined;
    const maxAttempts = Number(maxAttemptsCfg?.value || 5);
    const lockoutMins = Number(lockoutMinsCfg?.value || 15);

    const nextAttempts = row.failed_login_attempts + 1;
    let lockUntil: string | null = null;
    if (nextAttempts >= maxAttempts) {
      lockUntil = new Date(Date.now() + lockoutMins * 60 * 1000).toISOString();
    }
    db.prepare(`
      UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextAttempts, lockUntil, row.id);

    recordLogin(row.id, false, lockUntil ? 'Lockout triggered' : 'Invalid password');
    if (lockUntil) {
      return {
        ok: false,
        error: `Account locked for ${lockoutMins} minutes after ${maxAttempts} failed login attempts.`,
        lockedUntil: lockUntil,
      };
    }
    return {
      ok: false,
      error: `Invalid username or password. (${maxAttempts - nextAttempts} attempts remaining)`,
    };
  }

  // Successful login
  db.prepare(`
    UPDATE users
    SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now'), last_login_ip = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(ip, row.id);

  recordLogin(row.id, true, null);

  const sessionId = crypto.randomUUID();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, row.id, tokenHash, ip, ua, expiresAt);

  const authedUser = loadUserWithPermissions(row.id)!;
  logAudit({
    user: authedUser,
    action: 'LOGIN_SUCCESS',
    entityType: 'SESSION',
    entityId: sessionId,
    details: `Authenticated via web portal (${authedUser.role_code})`,
    req,
  });

  return {
    ok: true,
    user: authedUser,
    signedCookie: signToken(rawToken),
  };
}

export function setSessionCookie(res: Response, signedCookie: string) {
  res.cookie(SESSION_COOKIE_NAME, signedCookie, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const cookieVal = req.cookies?.[SESSION_COOKIE_NAME] || req.headers['x-hpsl-session'];
  if (!cookieVal || typeof cookieVal !== 'string') {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const rawToken = verifySignedToken(cookieVal);
  if (!rawToken) {
    res.status(401).json({ error: 'Invalid or tampered session token.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const session = db.prepare(`
    SELECT id, user_id, expires_at, revoked_at
    FROM user_sessions
    WHERE token_hash = ?
  `).get(tokenHash) as { id: string; user_id: number; expires_at: string; revoked_at: string | null } | undefined;

  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    res.status(401).json({ error: 'Session expired or revoked. Please sign in again.' });
    return;
  }

  const user = loadUserWithPermissions(session.user_id);
  if (!user) {
    res.status(401).json({ error: 'Account inactive or unavailable.' });
    return;
  }

  req.user = user;
  req.sessionId = session.id;
  next();
}

export function requirePermission(permissionCode: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!req.user.permissions.includes(permissionCode)) {
      logAudit({
        user: req.user,
        action: 'ACCESS_DENIED',
        entityType: 'PERMISSION',
        entityId: permissionCode,
        details: `Role ${req.user.role_code} attempted unauthorized action on ${req.method} ${req.originalUrl}`,
        req,
      });
      res.status(403).json({ error: `Permission denied: ${permissionCode} required.` });
      return;
    }
    next();
  };
}
