import { useCallback, useEffect, useState } from 'react';
import { AdminConsoleView } from './components/AdminConsoleView';
import { AppShell, type NavTab } from './components/AppShell';
import { ArchitectureDocsView } from './components/ArchitectureDocsView';
import { DashboardView } from './components/DashboardView';
import { GateCheckInView } from './components/GateCheckInView';
import { HostPortalView } from './components/HostPortalView';
import { LoginView } from './components/LoginView';
import { ReportsView } from './components/ReportsView';
import { RequestFormModal } from './components/RequestFormModal';
import { RequestsListView } from './components/RequestsListView';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  cacheAnalytics,
  cacheRequests,
  getCachedAnalytics,
  getCachedRequests,
  getOfflineQueue,
  syncOfflineQueue,
} from './lib/offlineStore';
import type {
  AnalyticsData,
  HostOption,
  NotificationItem,
  User,
  VisitorRequest,
} from './types';

export default function App() {
  const isOnline = useOnlineStatus();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hpsl_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');
  const [newRequestOpen, setNewRequestOpen] = useState(false);

  const [requests, setRequests] = useState<VisitorRequest[]>(() => getCachedRequests());
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(() => getCachedAnalytics());
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [outbox, setOutbox] = useState<NotificationItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState<VisitorRequest | null>(null);
  const [gateTargetRequest, setGateTargetRequest] = useState<VisitorRequest | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getOfflineQueue().length);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('hpsl_theme', theme);
  }, [theme]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const refreshData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const [reqRes, anaRes, notifRes, hostRes] = await Promise.all([
        fetch('/api/requests?limit=200'),
        fetch('/api/analytics'),
        fetch('/api/notifications'),
        fetch('/api/hosts'),
      ]);

      if (reqRes.ok) {
        const d = await reqRes.json();
        setRequests(d.requests || []);
        cacheRequests(d.requests || []);
      }
      if (anaRes.ok) {
        const a = await anaRes.json();
        setAnalytics(a);
        cacheAnalytics(a);
      }
      if (notifRes.ok) {
        const n = await notifRes.json();
        setNotifications(n.notifications || []);
        setOutbox(n.outbox || []);
      }
      if (hostRes.ok) {
        const h = await hostRes.json();
        setHosts(h.hosts || []);
      }
    } catch {
      // Fallback gracefully to cached offline data
      setRequests(getCachedRequests());
      setAnalytics(getCachedAnalytics());
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  // Verify existing session on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      })
      .catch(() => {
        // Offline check
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // Load operational data after sign-in + poll every 25s
  useEffect(() => {
    if (!user) return;
    void refreshData();
    const interval = setInterval(() => {
      if (navigator.onLine) void refreshData();
    }, 25000);
    return () => clearInterval(interval);
  }, [user, refreshData]);

  // Auto-sync offline queue when connectivity returns
  const handleSyncNow = useCallback(async () => {
    const result = await syncOfflineQueue();
    setPendingSyncCount(result.remainingCount);
    if (result.syncedCount > 0) {
      showToast(`Synchronized ${result.syncedCount} offline record(s) with local plant server.`);
      void refreshData();
    }
  }, [refreshData, showToast]);

  useEffect(() => {
    if (isOnline && user && getOfflineQueue().length > 0) {
      void handleSyncNow();
    }
  }, [isOnline, user, handleSyncNow]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore offline logout
    }
    setUser(null);
    setActiveTab('dashboard');
  };

  const handleMarkRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch {
      // ignore offline
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      // ignore offline
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 text-sm">
        Initializing HPSL Plant Access Security...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setActiveTab(loggedInUser.role_code === 'HOST_EMPLOYEE' ? 'host' : 'dashboard');
        }}
      />
    );
  }

  return (
    <AppShell
      user={user}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      globalSearch={globalSearch}
      onGlobalSearchChange={setGlobalSearch}
      onOpenNewRequest={() => setNewRequestOpen(true)}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      notifications={notifications}
      onMarkAllRead={handleMarkAllRead}
      onMarkRead={handleMarkRead}
      isOnline={isOnline}
      pendingSyncCount={pendingSyncCount}
      onManualSync={handleSyncNow}
    >
      {toastMsg && (
        <div
          role="status"
          className="no-print mb-4 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 dark:border-emerald-800 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200"
        >
          {toastMsg}
        </div>
      )}

      {activeTab === 'dashboard' && (
        <DashboardView
          user={user}
          analytics={analytics}
          requests={requests}
          loading={loadingData}
          onNavigate={setActiveTab}
          onSelectRequest={(req) => {
            setSelectedRequest(req);
            setActiveTab('requests');
          }}
        />
      )}

      {activeTab === 'requests' && (
        <RequestsListView
          user={user}
          requests={requests}
          globalSearch={globalSearch}
          selectedRequest={selectedRequest}
          onSelectRequest={setSelectedRequest}
          onRefresh={refreshData}
          onOpenGatePass={(req) => {
            setGateTargetRequest(req);
            setActiveTab('gate');
          }}
        />
      )}

      {activeTab === 'gate' && (
        <GateCheckInView
          requests={requests}
          initialRequest={gateTargetRequest}
          onRefresh={refreshData}
        />
      )}

      {activeTab === 'host' && (
        <HostPortalView
          user={user}
          requests={requests}
          isOnline={isOnline}
          onRefresh={() => {
            setPendingSyncCount(getOfflineQueue().length);
            void refreshData();
          }}
        />
      )}

      {activeTab === 'reports' && <ReportsView user={user} requests={requests} />}

      {activeTab === 'admin' && <AdminConsoleView outbox={outbox} />}

      {activeTab === 'docs' && <ArchitectureDocsView />}

      <RequestFormModal
        isOpen={newRequestOpen}
        onClose={() => setNewRequestOpen(false)}
        user={user}
        hosts={hosts}
        isOnline={isOnline}
        onSubmitted={(offlineQueued) => {
          setPendingSyncCount(getOfflineQueue().length);
          if (offlineQueued) {
            showToast('Offline Mode: Request saved locally and queued for automatic synchronization.');
          } else {
            showToast('Visitor request saved and notifications dispatched.');
            void refreshData();
          }
        }}
      />
    </AppShell>
  );
}
