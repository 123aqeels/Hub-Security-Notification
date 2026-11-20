import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Shield, UserCheck } from 'lucide-react';
import type { User } from '../types';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const ROLE_PRESETS = [
  {
    level: 'Admin',
    role: 'Security Administrator',
    username: 'admin',
    pass: 'Admin@123',
    scope: 'Users, Config, Audit, Backups',
  },
  {
    level: 'Security Officer',
    role: 'Security Officer',
    username: 'security',
    pass: 'Officer@123',
    scope: 'Approve, Gate Check-In, Passes',
  },
  {
    level: 'User',
    role: 'Department Requestor',
    username: 'requestor',
    pass: 'Requestor@123',
    scope: 'Create & Track Requests',
  },
  {
    level: 'User',
    role: 'Host Employee',
    username: 'host',
    pass: 'Host@123',
    scope: 'Confirm Arrival & Departure',
  },
  {
    level: 'User',
    role: 'Read-Only Management',
    username: 'management',
    pass: 'Mgmt@123',
    scope: 'Analytics & Export Reports',
  },
];

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, theme, onToggleTheme }) => {
  const [username, setUsername] = useState('security');
  const [password, setPassword] = useState('Officer@123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
      } else {
        onLoginSuccess(data.user);
      }
    } catch {
      setError('Cannot reach local plant server. Verify network or server status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Left Visual Column — Plant Gatehouse */}
      <div className="relative lg:w-1/2 min-h-[260px] lg:min-h-screen bg-slate-900 overflow-hidden flex flex-col justify-between p-8 lg:p-12">
        {!imgError ? (
          <img
            src="/src/assets/images/hpsl_plant_gate_1795166148859.jpg"
            alt="HPSL Industrial Plant Main Security Gatehouse"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-65"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950/60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/40" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/hpsl_security_emblem_1795166148541.jpg"
              alt="HPSL Security Emblem"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-lg object-cover border border-amber-500/40"
            />
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">HPSL Plant Security</p>
              <p className="text-xs text-slate-300">Site A · Main Gate Control</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded-lg border border-white/20 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
        </div>

        <div className="relative z-10 max-w-xl mt-12 lg:mt-0">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
            Plant Access Security &amp; Visitor Notification System
          </h1>
          <p className="mt-4 text-sm lg:text-base text-slate-200 leading-relaxed">
            Centralized gate access control, CNIC verification, host arrival confirmation, QR/barcode
            badging, and offline-resilient plant security ledger for local LAN operation.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-6 text-xs text-slate-200">
            <div>
              <p className="font-mono text-lg font-semibold text-amber-400 tabular-nums">10 Stages</p>
              <p className="mt-0.5 text-slate-300">Draft to Closed audit flow</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-amber-400 tabular-nums">Offline PWA</p>
              <p className="mt-0.5 text-slate-300">Local SQLite &amp; auto-sync</p>
            </div>
            <div>
              <p className="font-mono text-lg font-semibold text-amber-400 tabular-nums">5 RBAC Roles</p>
              <p className="mt-0.5 text-slate-300">Admin, Officer &amp; User tiers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Security Portal Sign In
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Authenticate with your HPSL employee credentials. Failed attempts are logged and audited.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter employee username"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-10 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-amber-500 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              {loading ? 'Verifying Credentials...' : 'Sign In to Plant Control'}
            </button>
          </form>

          {/* Role Access Level Quick-Switch Directory */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
              Station Role Quick-Fill (Admin / Security Officer / User Tiers)
            </p>
            <div className="grid grid-cols-1 gap-2">
              {ROLE_PRESETS.map((preset) => (
                <button
                  key={preset.username}
                  type="button"
                  onClick={() => {
                    setUsername(preset.username);
                    setPassword(preset.pass);
                    setError(null);
                  }}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    username === preset.username
                      ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-600'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {preset.role}
                    </span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">{preset.level}</span>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">{preset.scope}</p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                    {preset.username}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
