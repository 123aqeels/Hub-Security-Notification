import React, { useState } from 'react';

const SECTIONS = [
  { id: 'architecture', title: '01. System Architecture' },
  { id: 'erd', title: '02. Database ERD' },
  { id: 'schema', title: '03. SQL Database Schema' },
  { id: 'structure', title: '04. Folder Structure' },
  { id: 'api', title: '05. REST API Documentation' },
  { id: 'security', title: '06. Security Controls' },
  { id: 'deployment', title: '07. Offline LAN Deployment & Install' },
  { id: 'backup', title: '08. Backup, Recovery & Roadmap' },
] as const;

export const ArchitectureDocsView: React.FC = () => {
  const [active, setActive] = useState<(typeof SECTIONS)[number]['id']>('architecture');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          System Architecture, ERD &amp; Offline Deployment Manual
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Complete technical documentation for HPSL Plant Access Security local intranet deployment
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <nav className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 space-y-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                active === s.id
                  ? 'bg-slate-900 text-white dark:bg-amber-600'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <article className="lg:col-span-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm space-y-4 leading-relaxed">
          {active === 'architecture' && (
            <>
              <h2 className="text-lg font-bold">01. Complete System Architecture</h2>
              <p className="text-slate-600 dark:text-slate-300">
                HPSL GateGuard operates as a self-contained, offline-first client-server Progressive Web Application
                designed for air-gapped or local company LAN plant networks without internet dependencies.
              </p>
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
{`[Gate Kiosk / Mobile Tablet / Admin PC] (Offline-capable PWA)
   |-- Service Worker (Workbox NetworkFirst + Asset Precache)
   |-- LocalStorage / Offline Mutation Queue + Draft Auto-Save
   |
   v  (Intranet HTTPS / HTTP on LAN Port 3000)
[Node.js + Express Security Server (server.ts)]
   |-- Authentication & RBAC Middleware (scrypt + HMAC Cookie + Lockout)
   |-- Workflow State Machine (Draft -> Submitted -> Review -> Approved -> Gate -> Closed)
   |-- Notification Dispatcher (Local Alerts + Intranet Email Outbox + SMS Queue)
   |-- Daily Hot Backup Scheduler (6h check -> data/backups/)
   |
   v
[SQLite WAL Engine (data/hpsl_security.db)]
   |-- 14 Normalized Tables with Foreign Keys & High-Speed Indexes`}
              </pre>
            </>
          )}

          {active === 'erd' && (
            <>
              <h2 className="text-lg font-bold">02. Entity Relationship Diagram (ERD)</h2>
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
{`[roles] 1---* [users] 1---* [user_sessions]
   |             |
   *             +---* [login_history]
[role_permissions] *---1 [permissions]

[users (Requestor/Host/Approver)] 1---* [requests] *---1 [visitors]
                                            |      *---1 [vehicles]
                                            |
                                            +---1 [checkin_checkout]
                                            +---* [attachments]
                                            +---* [notifications]

[audit_logs] (immutable event stream linked to users & entities)
[system_config] (key-value plant gate & security policy store)`}
              </pre>
            </>
          )}

          {active === 'schema' && (
            <>
              <h2 className="text-lg font-bold">03. SQLite Relational Schema Highlights</h2>
              <p className="text-slate-600 dark:text-slate-300">
                Enforces <code>PRAGMA foreign_keys = ON</code> and <code>PRAGMA journal_mode = WAL</code> across
                14 tables: <code>roles</code>, <code>permissions</code>, <code>role_permissions</code>, <code>users</code>,
                <code>user_sessions</code>, <code>login_history</code>, <code>visitors</code>, <code>vehicles</code>,
                <code>requests</code>, <code>checkin_checkout</code>, <code>notifications</code>, <code>audit_logs</code>,
                <code>attachments</code>, and <code>system_config</code>.
              </p>
              <p className="text-xs text-slate-500">
                Full DDL definitions are stored in <code>/server/db.ts</code> and <code>/docs/ARCHITECTURE_AND_DEPLOYMENT.md</code>.
              </p>
            </>
          )}

          {active === 'structure' && (
            <>
              <h2 className="text-lg font-bold">04. Project Folder Structure</h2>
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
{`/
├── server.ts                  # Express + Vite/Static entrypoint + Daily backup timer
├── server/
│   ├── db.ts                  # SQLite schema, indexes, seed data, hot backup helper
│   ├── auth.ts                # scrypt hashing, HMAC sessions, lockout, RBAC, audit
│   ├── notifications.ts       # Local, Email outbox, and SMS queue dispatcher
│   └── routes.ts              # REST API endpoints (/api/*)
├── src/
│   ├── App.tsx                # Application state, auth gate, offline sync controller
│   ├── types.ts               # Shared TypeScript interfaces
│   ├── lib/                   # validation.ts, offlineStore.ts, exportUtils.ts
│   ├── hooks/                 # usePWAInstall.ts, useOnlineStatus.ts
│   └── components/            # Dashboards, RequestForm, GateCheckIn, HostPortal, Reports, Admin
├── public/                    # PWA icons (192x192, 512x512, maskable, apple-touch-icon)
├── data/                      # Local SQLite database + automated backups/
└── docs/                      # ARCHITECTURE_AND_DEPLOYMENT.md`}
              </pre>
            </>
          )}

          {active === 'api' && (
            <>
              <h2 className="text-lg font-bold">05. REST API Documentation</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 font-semibold">
                      <th className="py-2 pr-4">Endpoint</th>
                      <th className="py-2 pr-4">Method</th>
                      <th className="py-2">Description &amp; Permission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    <tr><td className="py-2 pr-4">/api/auth/login</td><td className="pr-4">POST</td><td className="font-sans">Authenticate credentials, enforce lockout, issue HTTP-only session cookie</td></tr>
                    <tr><td className="py-2 pr-4">/api/requests</td><td className="pr-4">GET / POST</td><td className="font-sans">List scoped requests or create new request (<code>requests:create</code>)</td></tr>
                    <tr><td className="py-2 pr-4">/api/requests/:id/status</td><td className="pr-4">POST</td><td className="font-sans">Advance workflow stage &amp; issue pass code (<code>requests:approve</code>)</td></tr>
                    <tr><td className="py-2 pr-4">/api/checkin/:requestId</td><td className="pr-4">POST</td><td className="font-sans">Verify CNIC, save photo/signature, issue QR/Barcode badge (<code>gate:checkin</code>)</td></tr>
                    <tr><td className="py-2 pr-4">/api/checkin/:requestId/host-confirm</td><td className="pr-4">POST</td><td className="font-sans">Confirm visitor arrival or departure (<code>host:confirm</code>)</td></tr>
                    <tr><td className="py-2 pr-4">/api/checkout/:requestId</td><td className="pr-4">POST</td><td className="font-sans">Record exit time and close visitor pass (<code>gate:checkout</code>)</td></tr>
                    <tr><td className="py-2 pr-4">/api/analytics</td><td className="pr-4">GET</td><td className="font-sans">Security gate KPIs and management trend/company statistics</td></tr>
                    <tr><td className="py-2 pr-4">/api/backup/create</td><td className="pr-4">POST</td><td className="font-sans">Execute hot SQLite backup snapshot (<code>admin:backup</code>)</td></tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {active === 'security' && (
            <>
              <h2 className="text-lg font-bold">06. Implemented Security Controls</h2>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-300">
                <li><strong>Password Encryption:</strong> Per-user 16-byte random salt + <code>crypto.scryptSync</code> (64-byte key) verified with constant-time <code>timingSafeEqual</code>.</li>
                <li><strong>Session Management:</strong> 256-bit random session tokens signed with HMAC-SHA256, stored as SHA-256 hashes in <code>user_sessions</code>, delivered in <code>HttpOnly; SameSite=Lax</code> cookies with revocation support.</li>
                <li><strong>Account Lockout:</strong> Automatic 15-minute lockout after 5 consecutive failed logins; Security Admin can unlock immediately.</li>
                <li><strong>RBAC &amp; Audit Trail:</strong> Granular permission matrix across 5 roles (Admin, Security Officer, Dept Requestor, Host Employee, Read-Only Management). Every state change, login, and denial is logged with IP and User-Agent.</li>
                <li><strong>Input &amp; File Validation:</strong> Strict CNIC <code>XXXXX-XXXXXXX-X</code> format checks, CNIC expiry verification, duplicate visitor/vehicle detection, and 2MB JPG/PNG/PDF upload limits.</li>
              </ul>
            </>
          )}

          {active === 'deployment' && (
            <>
              <h2 className="text-lg font-bold">07. Installation &amp; Offline Local Server Deployment</h2>
              <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
{`# 1. Install dependencies (on build machine or offline npm cache)
npm install

# 2. Build production PWA bundle (precaches all UI & assets for offline gate tablets)
npm run build

# 3. Start local plant server on LAN (Port 3000)
NODE_ENV=production PORT=3000 npm start

# 4. Recommended Production Process Manager (PM2 / systemd on Ubuntu/Windows Server)
pm2 start "npm start" --name hpsl-gateguard
pm2 save`}
              </pre>
              <p className="text-slate-600 dark:text-slate-300">
                Point gatehouse terminals and employee browsers to <code>http://&lt;plant-server-lan-ip&gt;:3000</code> (or behind a local Nginx HTTPS reverse proxy with an internal plant CA certificate so camera capture and PWA install prompts work across LAN workstations).
              </p>
            </>
          )}

          {active === 'backup' && (
            <>
              <h2 className="text-lg font-bold">08. Backup, Recovery &amp; Future Enhancements</h2>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600 dark:text-slate-300">
                <li><strong>Daily Hot Backups:</strong> Automatic SQLite online backups (<code>db.backup()</code>) execute at startup and every 6 hours into <code>data/backups/hpsl_backup_daily_YYYY-MM-DD.db</code> without locking gate check-in writes.</li>
                <li><strong>Recovery Procedure:</strong> Stop server, copy desired <code>.db</code> file over <code>data/hpsl_security.db</code>, or use Admin Console &rarr; Backup &amp; Restore &rarr; Restore JSON Snapshot (which auto-creates a pre-restore snapshot first).</li>
                <li><strong>Future Enhancements:</strong> Intranet Active Directory / LDAP SSO binding, ANPR gate camera license-plate OCR integration, GSM modem SMS AT-command worker, and RFID turnstile barrier relay integration.</li>
              </ul>
            </>
          )}
        </article>
      </div>
    </div>
  );
};
