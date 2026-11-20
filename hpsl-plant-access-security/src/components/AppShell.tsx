import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  FileSpreadsheet,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sun,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import type { NotificationItem, User } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab =
  | 'dashboard'
  | 'requests'
  | 'gate'
  | 'host'
  | 'reports'
  | 'admin'
  | 'docs';

interface AppShellProps {
  user: User;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  globalSearch: string;
  onGlobalSearchChange: (val: string) => void;
  onOpenNewRequest: () => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onMarkRead: (id: number) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onManualSync: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  user,
  activeTab,
  onSelectTab,
  globalSearch,
  onGlobalSearchChange,
  onOpenNewRequest,
  onLogout,
  theme,
  onToggleTheme,
  notifications,
  onMarkAllRead,
  onMarkRead,
  isOnline,
  pendingSyncCount,
  onManualSync,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const canCreate = user.permissions.includes('requests:create');
  const canGate = user.permissions.includes('gate:checkin');
  const canHost = user.permissions.includes('host:confirm') || user.role_code === 'SECURITY_ADMIN';
  const canReports = user.permissions.includes('reports:view');
  const canAdmin =
    user.permissions.includes('admin:users') ||
    user.permissions.includes('admin:audit') ||
    user.permissions.includes('admin:config') ||
    user.permissions.includes('admin:backup');

  const navItems: { id: NavTab; label: string; Icon: React.FC<{ className?: string }>; visible: boolean }[] = [
    { id: 'dashboard', label: 'Command Dashboard', Icon: BarChart3, visible: true },
    { id: 'requests', label: 'Visitor Requests', Icon: ClipboardList, visible: true },
    { id: 'gate', label: 'Gate Check-In & Pass', Icon: ShieldCheck, visible: canGate },
    { id: 'host', label: 'Host Arrival Portal', Icon: UserCheck, visible: canHost },
    { id: 'reports', label: 'Reports & Exports', Icon: FileSpreadsheet, visible: canReports },
    { id: 'admin', label: 'Security Admin Console', Icon: Shield, visible: canAdmin },
    { id: 'docs', label: 'Architecture & Docs', Icon: BookOpen, visible: true },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Command Dashboard';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (260px) */}
      <aside
        className={`no-print fixed lg:static inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/src/assets/images/hpsl_security_emblem_1795166148541.jpg"
              alt="HPSL Emblem"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-md object-cover border border-amber-500/40 shrink-0"
            />
            <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white truncate">
              HPSL GateGuard
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {navItems
            .filter((item) => item.visible)
            .map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSelectTab(id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-amber-600 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
        </nav>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
              {user.full_name}
            </p>
            <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {user.role_name} · {user.access_level}
            </p>
            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {user.employee_id} · {user.department}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar — 3-Zone Contract */}
        <header className="no-print h-16 px-4 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-6 sticky top-0 z-30">
          {/* Zone 1: Menu toggle + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm whitespace-nowrap truncate">
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">HPSL Site A</span>
              <span className="text-slate-400 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {activeNavLabel}
              </span>
            </div>
          </div>

          {/* Zone 2: Global Search */}
          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => {
                  onGlobalSearchChange(e.target.value);
                  if (e.target.value && activeTab !== 'requests' && activeTab !== 'gate') {
                    onSelectTab('requests');
                  }
                }}
                placeholder="Search visitor, CNIC, vehicle, request #, host, company..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Toggle Notifications"
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-md bg-amber-600 text-white font-mono text-[10px] font-semibold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-semibold">Gate &amp; Host Alerts</span>
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">No recent alerts.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => onMarkRead(n.id)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                            n.is_read ? 'opacity-70' : 'bg-amber-50/40 dark:bg-amber-950/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {n.title}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">
                              {n.created_at.slice(11, 16)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {n.message}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {canCreate && (
              <button
                type="button"
                onClick={onOpenNewRequest}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                New Visitor Request
              </button>
            )}
          </div>
        </header>

        {/* Offline / Sync Queue Banner */}
        {(!isOnline || pendingSyncCount > 0) && (
          <div className="no-print px-4 lg:px-8 py-2.5 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>
                {!isOnline
                  ? 'Offline Mode Active — Viewing locally cached plant records. New drafts and requests are saved locally and queued for sync.'
                  : `${pendingSyncCount} offline record(s) queued and ready for synchronization with the local server.`}
              </span>
            </div>
            {isOnline && pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={onManualSync}
                className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync Now
              </button>
            )}
          </div>
        )}

        {/* Mobile Search Bar */}
        <div className="no-print md:hidden px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={globalSearch}
              onChange={(e) => onGlobalSearchChange(e.target.value)}
              placeholder="Search visitor, CNIC, vehicle, request #..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Viewport Container */}
        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
