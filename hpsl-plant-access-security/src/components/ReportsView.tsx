import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Printer, Table } from 'lucide-react';
import {
  exportRequestsToCSV,
  exportRequestsToExcel,
  exportRequestsToPDF,
} from '../lib/exportUtils';
import type { User, VisitorRequest, WorkflowStatus } from '../types';
import { StatusIndicator } from './StatusIndicator';

interface ReportsViewProps {
  user: User;
  requests: VisitorRequest[];
}

const STATUSES: WorkflowStatus[] = [
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

export const ReportsView: React.FC<ReportsViewProps> = ({ user, requests }) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [hostName, setHostName] = useState('');
  const [department, setDepartment] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [cnicNumber, setCnicNumber] = useState('');
  const [status, setStatus] = useState('');

  const canExport = user.permissions.includes('reports:export');

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (dateFrom && r.arrival_date < dateFrom) return false;
      if (dateTo && r.arrival_date > dateTo) return false;
      if (visitorName && !r.visitor_name.toLowerCase().includes(visitorName.toLowerCase())) return false;
      if (companyName && !r.visitor_company_name.toLowerCase().includes(companyName.toLowerCase())) return false;
      if (hostName && !r.visitor_host_name.toLowerCase().includes(hostName.toLowerCase())) return false;
      if (department && !r.department.toLowerCase().includes(department.toLowerCase())) return false;
      if (vehicleNumber && !r.vehicle_number.toLowerCase().includes(vehicleNumber.toLowerCase())) return false;
      if (cnicNumber && !r.cnic_number.includes(cnicNumber)) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }, [requests, dateFrom, dateTo, visitorName, companyName, hostName, department, vehicleNumber, cnicNumber, status]);

  const inputCls =
    'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Visitor Access Reports &amp; Compliance Exports
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Filter historical plant access logs and export PDF, Excel, CSV, or print-ready audit sheets
          </p>
        </div>

        {canExport && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportRequestsToPDF(filtered)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-amber-500 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF Export
            </button>
            <button
              type="button"
              onClick={() => exportRequestsToExcel(filtered)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => exportRequestsToCSV(filtered)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Table className="w-3.5 h-3.5" />
              CSV Export
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
          </div>
        )}
      </div>

      {/* Multi-Criteria Filter Matrix */}
      <section className="no-print rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Report Query Criteria ({filtered.length} matching rows)
          </h2>
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setVisitorName('');
              setCompanyName('');
              setHostName('');
              setDepartment('');
              setVehicleNumber('');
              setCnicNumber('');
              setStatus('');
            }}
            className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
          >
            Clear All Criteria
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Arrival From</label>
            <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Arrival To</label>
            <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Visitor Name</label>
            <input type="text" placeholder="Search name..." className={inputCls} value={visitorName} onChange={(e) => setVisitorName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Company Name</label>
            <input type="text" placeholder="Search company..." className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Host Name</label>
            <input type="text" placeholder="Search host..." className={inputCls} value={hostName} onChange={(e) => setHostName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Department</label>
            <input type="text" placeholder="e.g. Engineering" className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Vehicle Number</label>
            <input type="text" placeholder="e.g. LEA-24" className={`${inputCls} font-mono`} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">CNIC Number</label>
            <input type="text" placeholder="35202-..." className={`${inputCls} font-mono`} value={cnicNumber} onChange={(e) => setCnicNumber(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Visitor Status</label>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Report Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold text-slate-900 dark:text-white">
            HPSL Plant Access Audit Sheet
          </span>
          <span className="font-mono">Generated {new Date().toLocaleDateString()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3">Request ID</th>
                <th className="py-2.5 px-3">Visitor</th>
                <th className="py-2.5 px-3">CNIC</th>
                <th className="py-2.5 px-3">Company</th>
                <th className="py-2.5 px-3">Host &amp; Dept</th>
                <th className="py-2.5 px-3">Arrival</th>
                <th className="py-2.5 px-3">Vehicle</th>
                <th className="py-2.5 px-3">Gate In / Out</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">{r.request_number}</td>
                  <td className="py-2.5 px-3 font-medium">{r.visitor_name}</td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">{r.cnic_number}</td>
                  <td className="py-2.5 px-3">{r.visitor_company_name}</td>
                  <td className="py-2.5 px-3">
                    {r.visitor_host_name} · <span className="text-slate-500">{r.department}</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">{r.arrival_date} {r.arrival_time}</td>
                  <td className="py-2.5 px-3 font-mono">{r.vehicle_number || '-'}</td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                    {r.check_in_time ? r.check_in_time.slice(11, 16) : '-'} / {r.check_out_time ? r.check_out_time.slice(11, 16) : '-'}
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusIndicator status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
