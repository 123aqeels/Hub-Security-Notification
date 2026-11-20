import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { exportRequestsToCSV } from '../lib/exportUtils';
import type { PriorityLevel, User, VisitorRequest, VisitorType, WorkflowStatus } from '../types';
import { PriorityIndicator, StatusIndicator } from './StatusIndicator';

interface RequestsListViewProps {
  user: User;
  requests: VisitorRequest[];
  globalSearch: string;
  selectedRequest: VisitorRequest | null;
  onSelectRequest: (req: VisitorRequest | null) => void;
  onRefresh: () => void;
  onOpenGatePass?: (req: VisitorRequest) => void;
}

const ALL_STATUSES: WorkflowStatus[] = [
  'Draft',
  'Submitted',
  'Under Review',
  'Approved',
  'Rejected',
  'Visitor Arrived',
  'Checked In',
  'In Meeting',
  'Checked Out',
  'Closed',
];

const VISITOR_TYPES: VisitorType[] = [
  'Contractor',
  'Vendor',
  'Customer',
  'Auditor',
  'Government Official',
  'Guest',
  'Other',
];

const PRIORITIES: PriorityLevel[] = ['Low', 'Medium', 'High', 'Emergency'];

export const RequestsListView: React.FC<RequestsListViewProps> = ({
  user,
  requests,
  globalSearch,
  selectedRequest,
  onSelectRequest,
  onRefresh,
  onOpenGatePass,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [remarksInput, setRemarksInput] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const pageSize = 10;

  const canApprove = user.permissions.includes('requests:approve');

  const filtered = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (typeFilter && r.visitor_type !== typeFilter) return false;
      if (priorityFilter && r.priority_level !== priorityFilter) return false;
      if (q) {
        const hay = [
          r.request_number,
          r.visitor_name,
          r.cnic_number,
          r.vehicle_number,
          r.visitor_host_name,
          r.visitor_company_name,
          r.department,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, priorityFilter, globalSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSelectAll = () => {
    const pageIds = pageItems.map((r) => r.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkAction = async (action: 'approve' | 'reject' | 'close') => {
    if (selectedIds.length === 0) return;
    setActionMsg(null);
    const res = await fetch('/api/requests/bulk-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, action, remarks: `Bulk ${action} by ${user.full_name}` }),
    });
    if (res.ok) {
      setSelectedIds([]);
      setActionMsg(`Bulk action (${action}) completed.`);
      onRefresh();
    }
  };

  const handleStatusTransition = async (reqId: number, status: WorkflowStatus) => {
    setActionMsg(null);
    const res = await fetch(`/api/requests/${reqId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        security_remarks: remarksInput,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setRemarksInput('');
      onSelectRequest(data.request);
      onRefresh();
    } else {
      setActionMsg(data.error || 'Transition failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Visitor Access Request Ledger
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {filtered.length} matching records across all workflow stages
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportRequestsToCSV(filtered)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 self-start cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export Filtered CSV
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
          <Filter className="w-3.5 h-3.5" />
          Filters:
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by Status"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by Visitor Type"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="">All Visitor Types</option>
          {VISITOR_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by Priority"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {(statusFilter || typeFilter || priorityFilter) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('');
              setTypeFilter('');
              setPriorityFilter('');
              setPage(1);
            }}
            className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
          >
            Reset Filters
          </button>
        )}

        {/* Bulk Action Bar */}
        {canApprove && selectedIds.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
              {selectedIds.length} selected
            </span>
            <button
              type="button"
              onClick={() => handleBulkAction('approve')}
              className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600 cursor-pointer"
            >
              Bulk Approve
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('reject')}
              className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600 cursor-pointer"
            >
              Bulk Reject
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('close')}
              className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-600 cursor-pointer"
            >
              Bulk Close
            </button>
          </div>
        )}
      </div>

      {actionMsg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          {actionMsg}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {pageItems.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No visitor requests match your current search or filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {canApprove && (
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all visible rows"
                        checked={pageItems.length > 0 && pageItems.every((r) => selectedIds.includes(r.id))}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className="py-3 px-4">Request ID</th>
                  <th className="py-3 px-4">Visitor &amp; CNIC</th>
                  <th className="py-3 px-4">Company &amp; Type</th>
                  <th className="py-3 px-4">Host &amp; Zone</th>
                  <th className="py-3 px-4">Schedule</th>
                  <th className="py-3 px-4">Vehicle</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageItems.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {canApprove && (
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.request_number}`}
                          checked={selectedIds.includes(r.id)}
                          onChange={() => toggleSelectOne(r.id)}
                        />
                      </td>
                    )}
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {r.request_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{r.visitor_name}</div>
                      <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.cnic_number}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 dark:text-slate-200">{r.visitor_company_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {r.visitor_type} · {r.number_of_visitors} pax
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 dark:text-slate-200">{r.visitor_host_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{r.visiting_area}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <div>{r.arrival_date}</div>
                      <div className="text-slate-400">{r.arrival_time} - {r.departure_time}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {r.vehicle_number || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <PriorityIndicator priority={r.priority_level} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator status={r.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectRequest(r)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <span className="font-mono tabular-nums">
            Page {safePage} of {totalPages} ({filtered.length} records)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 disabled:opacity-40 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Request Inspection & Workflow Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                    {selectedRequest.request_number}
                  </span>
                  <StatusIndicator status={selectedRequest.status} />
                  <PriorityIndicator priority={selectedRequest.priority_level} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Submitted by {selectedRequest.requestor_name} ({selectedRequest.requestor_employee_id}) · {selectedRequest.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectRequest(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close detail dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Visitor &amp; Identification
                  </h3>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedRequest.visitor_name}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {selectedRequest.visitor_designation || selectedRequest.visitor_type} · {selectedRequest.visitor_company_name}
                  </p>
                  <p className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    CNIC: {selectedRequest.cnic_number} (Exp: {selectedRequest.cnic_expiry_date})
                  </p>
                  <p className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    Phone: {selectedRequest.visitor_contact_number} {selectedRequest.visitor_email && `· ${selectedRequest.visitor_email}`}
                  </p>
                </div>

                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Plant Access &amp; Host Assignment
                  </h3>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Host: {selectedRequest.visitor_host_name}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Zone: {selectedRequest.visiting_area} · {selectedRequest.building} {selectedRequest.floor && `· ${selectedRequest.floor}`}
                  </p>
                  <p className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    Window: {selectedRequest.arrival_date} {selectedRequest.arrival_time} to {selectedRequest.departure_date} {selectedRequest.departure_time}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Restricted Area: {selectedRequest.restricted_area_required ? 'Yes' : 'No'} · Safety Induction: {selectedRequest.safety_induction_required ? 'Yes' : 'No'} · PPE: {selectedRequest.ppe_required ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Visit Purpose, Vehicle &amp; Logistics
                </h3>
                <p className="font-medium text-slate-900 dark:text-white">{selectedRequest.meeting_subject}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{selectedRequest.purpose_of_visit}</p>
                <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>Vehicle: {selectedRequest.vehicle_number || 'None'} {selectedRequest.vehicle_type && `(${selectedRequest.vehicle_type})`}</span>
                  <span>·</span>
                  <span>Meal: {selectedRequest.meal_required ? 'Yes' : 'No'}</span>
                  <span>·</span>
                  <span>Tea/Coffee: {selectedRequest.tea_coffee_required ? 'Yes' : 'No'}</span>
                  <span>·</span>
                  <span>Guest House: {selectedRequest.guest_house_required ? 'Yes' : 'No'}</span>
                </div>
                {selectedRequest.special_instructions && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 pt-1">
                    Instructions: {selectedRequest.special_instructions}
                  </p>
                )}
                {selectedRequest.security_remarks && (
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    Security Remarks: {selectedRequest.security_remarks}
                  </p>
                )}
              </div>

              {/* Security Review Controls */}
              {canApprove && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-950/60">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Security Officer Workflow Actions
                  </h3>
                  <input
                    type="text"
                    value={remarksInput}
                    onChange={(e) => setRemarksInput(e.target.value)}
                    placeholder="Add security review or gate remarks (optional)..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleStatusTransition(selectedRequest.id, 'Under Review')}
                      className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 cursor-pointer"
                    >
                      Mark Under Review
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusTransition(selectedRequest.id, 'Approved')}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Approve &amp; Generate Pass
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusTransition(selectedRequest.id, 'Rejected')}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-600 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject Access
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusTransition(selectedRequest.id, 'Visitor Arrived')}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    >
                      Mark Visitor Arrived
                    </button>
                    {onOpenGatePass && ['Approved', 'Visitor Arrived', 'Checked In', 'In Meeting'].includes(selectedRequest.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectRequest(null);
                          onOpenGatePass(selectedRequest);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Open in Gate Check-In
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedRequest.status === 'Draft' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleStatusTransition(selectedRequest.id, 'Submitted')}
                    className="rounded-lg bg-slate-900 dark:bg-amber-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                  >
                    Submit Draft for Security Review
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
