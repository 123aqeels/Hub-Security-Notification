# HPSL Plant Access Security & Visitor Notification Management System

## 1. Complete System Architecture
HPSL GateGuard is a local-network-first, offline-capable Progressive Web Application (PWA) built for industrial plant gatehouse security and visitor lifecycle governance:
- **Presentation Tier (PWA Client)**: React 19 + TypeScript + Tailwind CSS v4 bundled with Vite and `vite-plugin-pwa` (Workbox service worker precache + runtime `NetworkFirst` API cache + LocalStorage draft auto-save & offline mutation queue).
- **Application Tier (Local Node.js / Express Server)**: Runs on port `3000` inside the company intranet (`server.ts`, `server/routes.ts`, `server/auth.ts`, `server/notifications.ts`). Provides RBAC authorization, CNIC & duplicate detection validation, QR/Barcode pass tokenization, audit logging, and notification dispatching.
- **Persistence Tier (SQLite WAL)**: Embedded SQLite database (`data/hpsl_security.db`) with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`, requiring zero external cloud or database server dependencies.

## 2. Database Entity Relationship Diagram (ERD)
```
[roles] 1 ──── * [users] 1 ──── * [user_sessions]
   │                │
   │                └──── * [login_history]
   └──── * [role_permissions] * ──── 1 [permissions]

[users] (Requestor / Host / Approver)
   │
   └── 1 ──── * [requests] * ──── 1 [visitors]
                   │    * ──── 1 [vehicles]
                   │
                   ├──── 1 [checkin_checkout]
                   ├──── * [attachments]
                   └──── * [notifications]

[audit_logs] (Immutable security audit log)
[system_config] (Plant gate & policy parameters)
```

## 3. SQLite Database Schema
Defined in `/server/db.ts` (`SQL_SCHEMA`), covering all 14 normalized tables with primary keys, foreign keys, `CHECK` constraints, and query indexes on `status`, `arrival_date`, `cnic_number`, `vehicle_number`, `visitor_company_name`, `department`, `visitor_host_name`, `created_at`, and `notifications(user_id, is_read)`.

## 4. Folder Structure
- `server.ts` — Express server + Vite dev / production static serving + 6-hour daily backup scheduler
- `server/db.ts` — SQLite schema, initial RBAC & sample data seeding, hot `.backup()` utilities
- `server/auth.ts` — `scrypt` password hashing, HMAC-SHA256 signed cookies, account lockout, IP login history, RBAC middleware
- `server/notifications.ts` — Local dashboard alerts, Email outbox, and SMS gateway queue
- `server/routes.ts` — Complete REST API (`/api/*`)
- `src/App.tsx` — Root state, auth lifecycle, offline sync, theme management
- `src/lib/` — `validation.ts`, `offlineStore.ts`, `exportUtils.ts`
- `src/components/` — `LoginView`, `AppShell`, `DashboardView`, `RequestFormModal`, `RequestsListView`, `GateCheckInView`, `HostPortalView`, `ReportsView`, `AdminConsoleView`, `ArchitectureDocsView`
- `public/` — PWA SVG & PNG icons (`192x192`, `512x512`, `maskable-512x512`, `apple-touch-icon`)

## 5. User Roles & Access Levels
1. **Security Administrator (`Admin`)** — Full access: user creation/unlock, system config, audit logs, backups, reports.
2. **Security Officer (`Security Officer`)** — Review/approve/reject requests, gate CNIC check-in, camera photo & signature capture, QR/Barcode pass printing, check-out.
3. **Department Requestor (`User`)** — Create/draft/submit visitor requests, track status, receive alerts.
4. **Host Employee (`User`)** — View assigned visitors, confirm visitor arrival & departure, add host remarks.
5. **Read-Only Management (`User`)** — Executive analytics dashboard, trends, PDF/Excel/CSV report downloads.

## 6. Security Controls
- Per-user 16-byte random salt + `crypto.scryptSync` (64-byte derived key) + `crypto.timingSafeEqual`.
- Signed `HttpOnly; SameSite=Lax` session cookies backed by `user_sessions` revocation table.
- Configurable failed-login lockout (default: 5 failed attempts -> 15-minute lockout) with admin unlock.
- Full IP address and User-Agent logging in `login_history` and `audit_logs`.
- Strict CNIC regex (`XXXXX-XXXXXXX-X`), expiry validation, duplicate visitor/vehicle detection, and 2MB JPG/PNG/PDF upload limits.

## 7. Offline Local Server Installation & Deployment Guide
```bash
# 1. Install dependencies
npm install

# 2. Build production frontend & Workbox service worker
npm run build

# 3. Start production server on port 3000
NODE_ENV=production PORT=3000 npm start
```
For permanent plant deployment on Windows Server or Ubuntu LTS:
- Run behind `pm2` (`pm2 start "npm start" --name hpsl-gateguard`) or `systemd`.
- Bind an internal Nginx TLS reverse proxy (`https://gate.hpsl.local`) with your organization's local CA certificate so browser webcam capture (`getUserMedia`) and PWA installation work across all LAN gatehouse tablets and PCs without internet access.

## 8. Backup & Recovery Procedure
- **Automated Daily Hot Backup**: Runs automatically via SQLite online backup API (`db.backup()`) into `data/backups/hpsl_backup_daily_YYYY-MM-DD.db`.
- **Manual & JSON Snapshots**: Security Administrators can trigger `.db` snapshots, download `.db` files, or export/restore JSON snapshots directly from **Security Admin Console -> Backup & Restore**.
- **Disaster Recovery**: Stop the Node service, replace `data/hpsl_security.db` with the verified backup `.db` file, and restart the service.

## 9. Future Enhancement Recommendations
1. Intranet Active Directory / LDAP authentication integration.
2. ANPR (Automatic Number Plate Recognition) IP camera feed integration at Main Gate barriers.
3. Local GSM/LTE SMS modem AT-command worker consuming `notifications` rows where `channel = 'SMS'`.
4. RFID/QR turnstile barrier relay integration over Modbus/TCP or REST webhook.
