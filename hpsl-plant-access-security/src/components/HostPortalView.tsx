import React, { useState } from 'react';
import { CheckCircle2, LogOut, UserCheck } from 'lucide-react';
import { enqueueOfflineAction } from '../lib/offlineStore';
import type { User, VisitorRequest } from '../types';
import { StatusIndicator } from './StatusIndicator';

interface HostPortalViewProps {
  user: User;
  requests: VisitorRequest[];
  isOnline: boolean;
  onRefresh: () => void;
}

export const HostPortalView: React.FC<HostPortalViewProps> = ({
  user,
  requests,
  isOnline,
  onRefresh,
}) => {
  const [remarksByReq, setRemarksByReq] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const myVisitors = requests.filter((r) => {
    if (user.role_code === 'SECURITY_ADMIN') return r.status !== 'Draft';
    return (
      r.visitor_host_user_id === user.id ||
      r.visitor_host_name.toLowerCase() === user.full_name.toLowerCase()
    );
  });

  const handleConfirm = async (reqId: number, confirmType: 'arrival' | 'departure') => {
    const hostRemarks = remarksByReq[reqId] || '';
    if (!isOnline) {
      enqueueOfflineAction({
        type: 'HOST_CONFIRM',
        payload: { requestId: reqId, confirmType, host_remarks: hostRemarks },
      });
      setFeedback(`Offline: Host ${confirmType} confirmation queued for sync.`);
      return;
    }

    const res = await fetch(`/api/checkin/${reqId}/host-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: confirmType, host_remarks: hostRemarks }),
    });
    if (res.ok) {
      setFeedback(`Visitor ${confirmType} confirmed successfully.`);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Host Employee Visitor Confirmation Portal
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Confirm incoming visitor arrival and meeting departure for visitors assigned to {user.full_name}
        </p>
      </div>

      {feedback && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {feedback}
        </div>
      )}

      {myVisitors.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-sm text-slate-500">
          No incoming or active visitors assigned to your host account.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myVisitors.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {r.request_number}
                  </span>
                  <StatusIndicator status={r.status} />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {r.visitor_name}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {r.visitor_company_name} · {r.visitor_type} · {r.visiting_area}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Subject: {r.meeting_subject}
                </p>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  Schedule: {r.arrival_date} · {r.arrival_time} - {r.departure_time}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  value={remarksByReq[r.id] || ''}
                  onChange={(e) => setRemarksByReq((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Optional host remarks..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(r.host_arrival_confirmed)}
                    onClick={() => handleConfirm(r.id, 'arrival')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-45 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    {r.host_arrival_confirmed ? 'Arrival Confirmed' : 'Confirm Arrival'}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(r.host_departure_confirmed)}
                    onClick={() => handleConfirm(r.id, 'departure')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-amber-500 disabled:opacity-45 cursor-pointer"
                  >
                    {r.host_departure_confirmed ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Departure Confirmed
                      </>
                    ) : (
                      <>
                        <LogOut className="w-3.5 h-3.5" />
                        Confirm Departure
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
