import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';
import type { AnalyticsData, User, VisitorRequest } from '../types';
import type { NavTab } from './AppShell';
import { PriorityIndicator, StatusIndicator } from './StatusIndicator';

interface DashboardViewProps {
  user: User;
  analytics: AnalyticsData | null;
  requests: VisitorRequest[];
  loading: boolean;
  onNavigate: (tab: NavTab) => void;
  onSelectRequest: (req: VisitorRequest) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  analytics,
  requests,
  loading,
  onNavigate,
  onSelectRequest,
}) => {
  const defaultMode = user.role_code === 'MGMT_READONLY' ? 'management' : 'security';
  const [viewMode, setViewMode] = useState<'security' | 'management'>(defaultMode);

  if (loading && !analytics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  const sec = analytics?.securityMetrics ?? {
    todaysVisitors: 0,
    insidePlant: 0,
    approvedRequests: 0,
    pendingRequests: 0,
    rejectedRequests: 0,
    expiredApprovals: 0,
  };

  const mgmt = analytics?.managementMetrics ?? {
    monthlyTrends: [],
    categoryStats: [],
    companyWiseVisits: [],
    departmentWiseVisits: [],
    frequentVisitors: [],
    highSecurityVisitors: [],
  };

  const kpiCards = [
    {
      label: "Today's Visitors",
      value: sec.todaysVisitors,
      sub: 'Scheduled heads today',
      Icon: Users,
      tone: 'text-slate-900 dark:text-white',
    },
    {
      label: 'Visitors Inside Plant',
      value: sec.insidePlant,
      sub: 'Checked In & In Meeting',
      Icon: CheckCircle2,
      tone: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      label: 'Approved Requests',
      value: sec.approvedRequests,
      sub: 'Active gate passes',
      Icon: CheckCircle2,
      tone: 'text-sky-700 dark:text-sky-400',
    },
    {
      label: 'Pending Requests',
      value: sec.pendingRequests,
      sub: 'Submitted & Under Review',
      Icon: Clock,
      tone: 'text-amber-700 dark:text-amber-400',
    },
    {
      label: 'Rejected Requests',
      value: sec.rejectedRequests,
      sub: 'Denied gate access',
      Icon: XCircle,
      tone: 'text-red-700 dark:text-red-400',
    },
    {
      label: 'Expired Approvals',
      value: sec.expiredApprovals,
      sub: 'Past departure window',
      Icon: AlertTriangle,
      tone: 'text-amber-700 dark:text-amber-400',
    },
  ];

  const activeQueue = requests
    .filter((r) =>
      ['Submitted', 'Under Review', 'Approved', 'Visitor Arrived', 'Checked In', 'In Meeting'].includes(
        r.status
      )
    )
    .slice(0, 8);

  const maxMonthly = Math.max(1, ...mgmt.monthlyTrends.map((m) => m.total_visitors));
  const maxCategory = Math.max(1, ...mgmt.categoryStats.map((c) => c.count));
  const maxCompany = Math.max(1, ...mgmt.companyWiseVisits.map((c) => c.visits));
  const maxDept = Math.max(1, ...mgmt.departmentWiseVisits.map((d) => d.visits));

  return (
    <div className="space-y-8">
      {/* Header + Segmented View Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Plant Security Operations Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Signed in as {user.full_name} · {user.role_name} · {user.department}
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 self-start">
          <button
            type="button"
            onClick={() => setViewMode('security')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'security'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Security Dashboard
          </button>
          <button
            type="button"
            onClick={() => setViewMode('management')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'management'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Management Analytics
          </button>
        </div>
      </div>

      {/* 6-Card Security KPI Strip */}
      <section aria-label="Security Metrics" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map(({ label, value, sub, Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
              <Icon className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <p className={`mt-3 font-mono text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>
          </div>
        ))}
      </section>

      {viewMode === 'security' ? (
        <div className="space-y-6">
          {/* Active Gate & Plant Occupancy Ledger */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Active Gate Queue &amp; Plant Occupancy
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Real-time operational queue requiring review, gate check-in, or departure tracking
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('requests')}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap cursor-pointer"
              >
                View All Records
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeQueue.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No active gate requests in queue.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <th className="py-2.5 px-4">Request ID</th>
                      <th className="py-2.5 px-4">Visitor &amp; Company</th>
                      <th className="py-2.5 px-4">CNIC</th>
                      <th className="py-2.5 px-4">Host &amp; Area</th>
                      <th className="py-2.5 px-4">Schedule</th>
                      <th className="py-2.5 px-4">Priority</th>
                      <th className="py-2.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeQueue.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => onSelectRequest(r)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {r.request_number}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {r.visitor_name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {r.visitor_company_name} · {r.visitor_type}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {r.cnic_number}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800 dark:text-slate-200">{r.visitor_host_name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {r.visiting_area}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {r.arrival_date} · {r.arrival_time}
                        </td>
                        <td className="py-3 px-4">
                          <PriorityIndicator priority={r.priority_level} />
                        </td>
                        <td className="py-3 px-4">
                          <StatusIndicator status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* High Security & Restricted Area Watchlist */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                High-Security &amp; Restricted Zone Entries
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {mgmt.highSecurityVisitors.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 mr-2">
                      {item.request_number}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {item.visitor_name}
                    </span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {item.visitor_company_name}
                    </span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {item.visiting_area}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <PriorityIndicator priority={item.priority_level} />
                    <StatusIndicator status={item.status} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* Management Analytics Dashboard */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Visitor Trends Chart */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Monthly Visitor Trends
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Total visitor headcount and access requests per month
              </p>
              <div className="mt-6 space-y-3">
                {mgmt.monthlyTrends.length === 0 ? (
                  <p className="text-xs text-slate-500">No trend data available yet.</p>
                ) : (
                  mgmt.monthlyTrends.map((m) => (
                    <div key={m.month} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                          {m.month}
                        </span>
                        <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                          {m.total_visitors} visitors · {m.total_requests} requests
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-slate-900 dark:bg-amber-500 rounded"
                          style={{ width: `${Math.round((m.total_visitors / maxMonthly) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Visitor Category Statistics */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Visitor Category Statistics
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Distribution across contractor, vendor, auditor, customer, and official visits
              </p>
              <div className="mt-6 space-y-3">
                {mgmt.categoryStats.map((c) => (
                  <div key={c.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {c.category}
                      </span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                        {c.count} visits
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-600 dark:bg-amber-500 rounded"
                        style={{ width: `${Math.round((c.count / maxCategory) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Company-wise Visits */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Company-Wise Visits
                </h2>
              </div>
              <div className="mt-5 space-y-3">
                {mgmt.companyWiseVisits.map((c) => (
                  <div key={c.company} className="space-y-1">
                    <div className="flex justify-between text-xs gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {c.company}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                        {c.visits} req · {c.heads} heads
                      </span>
                    </div>
                    <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-sky-600 dark:bg-sky-500 rounded"
                        style={{ width: `${Math.round((c.visits / maxCompany) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Department-wise Visits */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Department-Wise Visits
              </h2>
              <div className="mt-5 space-y-3">
                {mgmt.departmentWiseVisits.map((d) => (
                  <div key={d.department} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {d.department}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {d.visits} requests
                      </span>
                    </div>
                    <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 dark:bg-emerald-500 rounded"
                        style={{ width: `${Math.round((d.visits / maxDept) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Frequent Visitors Table */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Frequent Plant Visitors
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-4">Visitor Name</th>
                    <th className="py-2.5 px-4">CNIC</th>
                    <th className="py-2.5 px-4">Company</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4 text-right">Total Plant Visits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mgmt.frequentVisitors.map((fv) => (
                    <tr key={fv.cnic_number} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {fv.full_name}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {fv.cnic_number}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {fv.company_name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {fv.visitor_type}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {fv.total_visits}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
