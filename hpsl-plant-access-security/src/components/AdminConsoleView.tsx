import React, { useEffect, useState } from 'react';
import {
  Database,
  Download,
  LockOpen,
  Plus,
  Save,
  Shield,
  Upload,
} from 'lucide-react';
import type {
  AuditLogEntry,
  BackupFileInfo,
  LoginHistoryEntry,
  NotificationItem,
  SystemConfigItem,
  User,
} from '../types';

interface AdminConsoleViewProps {
  outbox: NotificationItem[];
}

interface RoleRow {
  id: number;
  code: string;
  name: string;
  access_level: string;
  description: string;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({ outbox }) => {
  const [subTab, setSubTab] = useState<'users' | 'audit' | 'outbox' | 'config' | 'backup'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [configs, setConfigs] = useState<SystemConfigItem[]>([]);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    employee_id: '',
    username: '',
    full_name: '',
    email: '',
    department: '',
    phone: '',
    role_id: 3,
    password: '',
  });

  const loadAll = async () => {
    try {
      const [uRes, rRes, aRes, lRes, cRes, bRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/roles'),
        fetch('/api/audit-logs'),
        fetch('/api/login-history'),
        fetch('/api/config'),
        fetch('/api/backup/list'),
      ]);
      if (uRes.ok) setUsers((await uRes.json()).users);
      if (rRes.ok) setRoles((await rRes.json()).roles);
      if (aRes.ok) setAuditLogs((await aRes.json()).logs);
      if (lRes.ok) setLoginHistory((await lRes.json()).history);
      if (cRes.ok) setConfigs((await cRes.json()).configs);
      if (bRes.ok) setBackups((await bRes.json()).backups);
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Failed to create user.');
      return;
    }
    setMsg(`Created user ${newUser.username}.`);
    setNewUser({
      employee_id: '',
      username: '',
      full_name: '',
      email: '',
      department: '',
      phone: '',
      role_id: 3,
      password: '',
    });
    void loadAll();
  };

  const handleToggleUser = async (u: User) => {
    await fetch(`/api/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    void loadAll();
  };

  const handleUnlockUser = async (id: number) => {
    await fetch(`/api/users/${id}/unlock`, { method: 'POST' });
    setMsg('Account unlocked.');
    void loadAll();
  };

  const handleSaveConfig = async () => {
    setErr(null);
    setMsg(null);
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: configs.map((c) => ({ key: c.key, value: c.value })) }),
    });
    if (res.ok) setMsg('System security configuration saved.');
  };

  const handleCreateBackup = async () => {
    setMsg(null);
    const res = await fetch('/api/backup/create', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setMsg(`Created SQLite hot backup: ${data.backup.fileName}`);
      void loadAll();
    }
  };

  const handleExportJsonBackup = async () => {
    const res = await fetch('/api/backup/export-json');
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hpsl_snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreJsonBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/backup/restore-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Restore failed.');
      } else {
        setMsg(`Restored ${data.restoredRequests} request records from snapshot (pre-restore backup created).`);
      }
    } catch {
      setErr('Invalid JSON snapshot file.');
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Security Administration &amp; Governance
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Manage RBAC user accounts, audit trails, notification outbox, plant configuration, and SQLite backups
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
          {[
            ['users', 'Users & Roles'],
            ['audit', 'Audit & Logins'],
            ['outbox', 'Email / SMS Outbox'],
            ['config', 'Configuration'],
            ['backup', 'Backup & Restore'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id as typeof subTab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 px-4 py-2.5 text-xs font-medium text-red-800 dark:text-red-200">
          {err}
        </div>
      )}

      {/* 1. USERS & ROLES */}
      {subTab === 'users' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateUser}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Plant User Account
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <input required placeholder="Employee ID (e.g. HPSL-0501)" className={inputCls} value={newUser.employee_id} onChange={(e) => setNewUser({ ...newUser, employee_id: e.target.value })} />
              <input required placeholder="Username" className={inputCls} value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
              <input required placeholder="Full Name" className={inputCls} value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
              <input required type="email" placeholder="Email" className={inputCls} value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <input required placeholder="Department" className={inputCls} value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })} />
              <input placeholder="Phone" className={inputCls} value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
              <select className={inputCls} value={newUser.role_id} onChange={(e) => setNewUser({ ...newUser, role_id: Number(e.target.value) })}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.access_level})
                  </option>
                ))}
              </select>
              <input required type="password" minLength={6} placeholder="Initial Password (min 6)" className={inputCls} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 dark:bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-amber-500 cursor-pointer"
            >
              Create Account
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-4">Emp ID</th>
                    <th className="py-2.5 px-4">User</th>
                    <th className="py-2.5 px-4">Role &amp; Level</th>
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4">Last Login / IP</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((u) => {
                    const isLocked = Boolean(u.locked_until && new Date(u.locked_until).getTime() > Date.now());
                    return (
                      <tr key={u.id}>
                        <td className="py-2.5 px-4 font-mono">{u.employee_id}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">{u.full_name}</div>
                          <div className="font-mono text-slate-500">{u.username} · {u.email}</div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium">{u.role_name}</div>
                          <div className="text-slate-500">{u.access_level}</div>
                        </td>
                        <td className="py-2.5 px-4">{u.department}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {u.last_login_at ? `${u.last_login_at.slice(0, 16)} (${u.last_login_ip || '-'})` : 'Never'}
                        </td>
                        <td className="py-2.5 px-4">
                          {isLocked ? (
                            <span className="text-red-600 font-semibold">Locked ({u.failed_login_attempts} fails)</span>
                          ) : u.is_active ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">Active</span>
                          ) : (
                            <span className="text-slate-400">Disabled</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-2">
                          {isLocked && (
                            <button
                              type="button"
                              onClick={() => handleUnlockUser(u.id)}
                              className="inline-flex items-center gap-1 rounded border border-amber-400 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
                            >
                              <LockOpen className="w-3 h-3" />
                              Unlock
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleUser(u)}
                            className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-medium cursor-pointer"
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. AUDIT LOGS & LOGIN HISTORY */}
      {subTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold">Security Audit Trail</h2>
            </div>
            <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {auditLogs.map((log) => (
                <div key={log.id} className="px-4 py-2.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {log.action} · {log.entity_type} {log.entity_id}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{log.created_at}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{log.details}</p>
                  <p className="font-mono text-[11px] text-slate-400">
                    User: {log.username} ({log.role_code}) · IP: {log.ip_address}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Authentication &amp; IP Login History</h2>
            </div>
            <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loginHistory.map((h) => (
                <div key={h.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {h.username_attempted}
                    </span>
                    <span className={`ml-2 font-medium ${h.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>
                      {h.success ? 'Success' : `Failed (${h.failure_reason || 'Denied'})`}
                    </span>
                    <p className="font-mono text-[11px] text-slate-400 mt-0.5">
                      IP: {h.ip_address}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">{h.created_at}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* 3. EMAIL & SMS NOTIFICATION OUTBOX */}
      {subTab === 'outbox' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold">Automated Email &amp; SMS Gateway Outbox</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              In offline LAN mode, Email and SMS notifications queue locally for intranet SMTP relay or GSM SMS modem dispatch.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-4">Channel</th>
                  <th className="py-2.5 px-4">Event</th>
                  <th className="py-2.5 px-4">Recipient</th>
                  <th className="py-2.5 px-4">Message</th>
                  <th className="py-2.5 px-4">Delivery Status</th>
                  <th className="py-2.5 px-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {outbox.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{item.channel}</td>
                    <td className="py-2.5 px-4 font-mono">{item.event_type}</td>
                    <td className="py-2.5 px-4 font-mono">{item.recipient_address || '-'}</td>
                    <td className="py-2.5 px-4">{item.message}</td>
                    <td className="py-2.5 px-4 font-mono">{item.delivery_status}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{item.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. SYSTEM CONFIGURATION */}
      {subTab === 'config' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Plant Security &amp; Relay Configuration</h2>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save Settings
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {configs.map((c, idx) => (
              <div key={c.key} className="py-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-5">
                  <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{c.key}</p>
                  <p className="text-xs text-slate-500">{c.description}</p>
                </div>
                <div className="md:col-span-7">
                  <input
                    type="text"
                    value={c.value}
                    onChange={(e) => {
                      const next = [...configs];
                      next[idx] = { ...c, value: e.target.value };
                      setConfigs(next);
                    }}
                    className={inputCls}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. BACKUP & RESTORE */}
      {subTab === 'backup' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-600" />
                SQLite Hot Backup &amp; JSON Disaster Recovery
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Automated daily backups run automatically. Create manual snapshots or restore from a JSON backup file.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCreateBackup}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                Create SQLite Backup Now
              </button>
              <button
                type="button"
                onClick={handleExportJsonBackup}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON Snapshot
              </button>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Restore JSON Snapshot
                <input type="file" accept=".json" className="hidden" onChange={handleRestoreJsonBackup} />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
              Local Server Backup Archives (data/backups/)
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {backups.map((b) => (
                <div key={b.fileName} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono font-semibold text-slate-900 dark:text-white">{b.fileName}</p>
                    <p className="font-mono text-slate-500">
                      {(b.sizeBytes / 1024).toFixed(1)} KB · Created {new Date(b.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={`/api/backup/download/${encodeURIComponent(b.fileName)}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .db
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
