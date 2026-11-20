import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileEdit,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { PriorityLevel, WorkflowStatus } from '../types';

export const StatusIndicator: React.FC<{ status: WorkflowStatus }> = ({ status }) => {
  const styles: Record<WorkflowStatus, { cls: string; Icon: React.FC<{ className?: string }> }> = {
    Draft: {
      cls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      Icon: FileEdit,
    },
    Submitted: {
      cls: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
      Icon: Clock,
    },
    'Under Review': {
      cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      Icon: ShieldAlert,
    },
    Approved: {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      Icon: ShieldCheck,
    },
    Rejected: {
      cls: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
      Icon: XCircle,
    },
    'Visitor Arrived': {
      cls: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700',
      Icon: UserCheck,
    },
    'Checked In': {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700',
      Icon: LogIn,
    },
    'In Meeting': {
      cls: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
      Icon: CheckCircle2,
    },
    'Checked Out': {
      cls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      Icon: LogOut,
    },
    Closed: {
      cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800',
      Icon: CheckCircle2,
    },
  };

  const { cls, Icon } = styles[status] || styles.Submitted;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {status}
    </span>
  );
};

export const PriorityIndicator: React.FC<{ priority: PriorityLevel }> = ({ priority }) => {
  const map: Record<PriorityLevel, string> = {
    Low: 'text-slate-600 dark:text-slate-400',
    Medium: 'text-sky-700 dark:text-sky-400',
    High: 'text-amber-700 dark:text-amber-400 font-medium',
    Emergency: 'text-red-700 dark:text-red-400 font-semibold',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${map[priority]}`}>
      {(priority === 'High' || priority === 'Emergency') && (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      )}
      {priority}
    </span>
  );
};
