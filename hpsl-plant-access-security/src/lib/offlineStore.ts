import type { AnalyticsData, VisitorRequest } from '../types';

const DRAFT_STORAGE_KEY = 'hpsl_request_draft_v1';
const CACHE_REQUESTS_KEY = 'hpsl_cached_requests_v1';
const CACHE_ANALYTICS_KEY = 'hpsl_cached_analytics_v1';
const OFFLINE_QUEUE_KEY = 'hpsl_offline_mutation_queue_v1';

export interface OfflineQueueItem {
  offlineId: string;
  type: 'CREATE_REQUEST' | 'HOST_CONFIRM';
  payload: Record<string, unknown>;
  createdAt: string;
}

export function saveDraftLocal(draft: Record<string, unknown>) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // ignore storage quota errors
  }
}

export function loadDraftLocal(): (Record<string, unknown> & { savedAt?: string }) | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraftLocal() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function cacheRequests(requests: VisitorRequest[]) {
  try {
    localStorage.setItem(CACHE_REQUESTS_KEY, JSON.stringify(requests.slice(0, 150)));
  } catch {
    // ignore
  }
}

export function getCachedRequests(): VisitorRequest[] {
  try {
    const raw = localStorage.getItem(CACHE_REQUESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function cacheAnalytics(data: AnalyticsData) {
  try {
    localStorage.setItem(CACHE_ANALYTICS_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function getCachedAnalytics(): AnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_ANALYTICS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineAction(item: Omit<OfflineQueueItem, 'offlineId' | 'createdAt'>): OfflineQueueItem {
  const queue = getOfflineQueue();
  const fullItem: OfflineQueueItem = {
    ...item,
    offlineId: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  queue.push(fullItem);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  return fullItem;
}

export async function syncOfflineQueue(): Promise<{ syncedCount: number; remainingCount: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { syncedCount: 0, remainingCount: 0 };

  const remaining: OfflineQueueItem[] = [];
  let syncedCount = 0;

  for (const item of queue) {
    try {
      if (item.type === 'CREATE_REQUEST') {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...item.payload, client_offline_id: item.offlineId }),
        });
        if (res.ok || res.status === 409 || res.status === 400) {
          syncedCount++;
        } else {
          remaining.push(item);
        }
      } else if (item.type === 'HOST_CONFIRM') {
        const res = await fetch(`/api/checkin/${item.payload.requestId}/host-confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: item.payload.confirmType,
            host_remarks: item.payload.host_remarks,
          }),
        });
        if (res.ok) {
          syncedCount++;
        } else {
          remaining.push(item);
        }
      }
    } catch {
      remaining.push(item);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return { syncedCount, remainingCount: remaining.length };
}
