import React, { useEffect, useState } from 'react';
import { AlertTriangle, Save, Send, Upload, X } from 'lucide-react';
import {
  clearDraftLocal,
  enqueueOfflineAction,
  loadDraftLocal,
  saveDraftLocal,
} from '../lib/offlineStore';
import {
  fileToDataUrl,
  formatCnicInput,
  isCnicExpired,
  isValidCnic,
  validateAttachmentFile,
} from '../lib/validation';
import type { AttachmentItem, HostOption, PriorityLevel, User, VisitorType } from '../types';

interface RequestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  hosts: HostOption[];
  isOnline: boolean;
  onSubmitted: (offlineQueued?: boolean) => void;
}

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

export const RequestFormModal: React.FC<RequestFormModalProps> = ({
  isOpen,
  onClose,
  user,
  hosts,
  isOnline,
  onSubmitted,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  const initialForm = {
    entry_date: today,
    entry_time: nowTime,
    requestor_name: user.full_name,
    department: user.department,
    requestor_employee_id: user.employee_id,
    visitor_name: '',
    visitor_host_user_id: hosts[0]?.id ? String(hosts[0].id) : '',
    visitor_host_name: hosts[0]?.full_name || '',
    visitor_company_name: '',
    visitor_designation: '',
    visitor_contact_number: '',
    visitor_email: '',
    cnic_number: '',
    cnic_expiry_date: '2030-12-31',
    cnic_scan_data: '',
    visitor_photo_data: '',
    visitor_type: 'Contractor' as VisitorType,
    arrival_date: today,
    arrival_time: '09:00',
    departure_date: today,
    departure_time: '17:00',
    purpose_of_visit: '',
    meeting_subject: '',
    number_of_visitors: 1,
    duration_of_visit: '4 hours',
    priority_level: 'Medium' as PriorityLevel,
    vehicle_number: '',
    vehicle_type: '',
    driver_name: '',
    driver_cnic: '',
    vehicle_company: '',
    vehicle_entry_time: '',
    vehicle_exit_time: '',
    visiting_area: 'Power House & Turbine Hall',
    building: 'Admin Block A',
    floor: 'Ground Floor',
    specific_office: '',
    restricted_area_required: false,
    safety_induction_required: true,
    ppe_required: true,
    meal_required: false,
    tea_coffee_required: true,
    guest_house_required: false,
    transportation_required: false,
    special_instructions: '',
    security_remarks: '',
    host_remarks: '',
  };

  const [form, setForm] = useState(initialForm);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Restore auto-saved draft on open
  useEffect(() => {
    if (!isOpen) return;
    const saved = loadDraftLocal();
    if (saved) {
      setForm((prev) => ({ ...prev, ...saved }));
      if (saved.savedAt) setDraftSavedAt(saved.savedAt);
    }
  }, [isOpen]);

  // Auto-save draft locally on change
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      saveDraftLocal(form);
      setDraftSavedAt(new Date().toISOString());
    }, 600);
    return () => clearTimeout(timer);
  }, [form, isOpen]);

  // Duplicate visitor & vehicle detection
  useEffect(() => {
    if (!isOpen || !isOnline) return;
    const cleanCnic = form.cnic_number.trim();
    const cleanVeh = form.vehicle_number.trim();
    if (!isValidCnic(cleanCnic) && cleanVeh.length < 3) {
      setDupWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          cnic: isValidCnic(cleanCnic) ? cleanCnic : '',
          vehicle: cleanVeh,
          arrival_date: form.arrival_date,
        });
        const res = await fetch(`/api/check-duplicate?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const warnings: string[] = [];
        if (data.knownVisitor?.is_blacklisted) {
          warnings.push(`ALERT: CNIC ${cleanCnic} is flagged on the plant security watchlist.`);
        }
        if (data.duplicateVisitorRequest) {
          warnings.push(
            `Duplicate visitor request detected: ${data.duplicateVisitorRequest.request_number} (${data.duplicateVisitorRequest.status}) for this CNIC on ${form.arrival_date}.`
          );
        }
        if (data.duplicateVehicleRequest) {
          warnings.push(
            `Duplicate vehicle request detected: ${data.duplicateVehicleRequest.request_number} for vehicle ${data.duplicateVehicleRequest.vehicle_number}.`
          );
        }
        setDupWarning(warnings.length > 0 ? warnings.join(' ') : null);
      } catch {
        // ignore offline check
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [form.cnic_number, form.vehicle_number, form.arrival_date, isOpen, isOnline]);

  if (!isOpen) return null;

  const updateField = <K extends keyof typeof initialForm>(key: K, val: (typeof initialForm)[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleHostSelect = (hostId: string) => {
    const match = hosts.find((h) => String(h.id) === hostId);
    setForm((prev) => ({
      ...prev,
      visitor_host_user_id: hostId,
      visitor_host_name: match ? match.full_name : prev.visitor_host_name,
    }));
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    category: 'CNIC_SCAN' | 'VISITOR_PHOTO' | 'DOCUMENT'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateAttachmentFile(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    const dataUrl = await fileToDataUrl(file);
    if (category === 'CNIC_SCAN') {
      updateField('cnic_scan_data', dataUrl);
    } else if (category === 'VISITOR_PHOTO') {
      updateField('visitor_photo_data', dataUrl);
    } else {
      setAttachments((prev) => [
        ...prev,
        {
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          category,
          data_url: dataUrl,
        },
      ]);
    }
  };

  const handleSubmit = async (status: 'Draft' | 'Submitted') => {
    setError(null);

    if (status === 'Submitted') {
      if (!isValidCnic(form.cnic_number)) {
        setError('CNIC must match format XXXXX-XXXXXXX-X (13 digits).');
        return;
      }
      if (isCnicExpired(form.cnic_expiry_date)) {
        setError('CNIC expiry date is in the past. Renewed CNIC required.');
        return;
      }
      if (form.departure_date < form.arrival_date) {
        setError('Departure date cannot be earlier than arrival date.');
        return;
      }
      if (form.driver_cnic && !isValidCnic(form.driver_cnic)) {
        setError('Driver CNIC must match format XXXXX-XXXXXXX-X.');
        return;
      }
    }

    const payload = {
      ...form,
      visitor_host_user_id: form.visitor_host_user_id ? Number(form.visitor_host_user_id) : null,
      status,
      allow_duplicate: allowDuplicate,
      attachments,
    };

    setSubmitting(true);
    try {
      if (!isOnline) {
        enqueueOfflineAction({ type: 'CREATE_REQUEST', payload });
        clearDraftLocal();
        onSubmitted(true);
        onClose();
        return;
      }

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'DUPLICATE_VISITOR') {
          setDupWarning(data.error);
        }
        setError(data.error || 'Failed to save request.');
        return;
      }
      clearDraftLocal();
      onSubmitted(false);
      onClose();
    } catch {
      enqueueOfflineAction({ type: 'CREATE_REQUEST', payload });
      clearDraftLocal();
      onSubmitted(true);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500';
  const labelCls = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Visitor Plant Access Request Form
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Request ID auto-generated on save
              {draftSavedAt && ` · Draft auto-saved locally at ${draftSavedAt.slice(11, 19)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/60 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200"
            >
              {error}
            </div>
          )}

          {dupWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/50 dark:border-amber-700 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{dupWarning}</span>
              </div>
              <label className="flex items-center gap-1.5 font-semibold whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(e) => setAllowDuplicate(e.target.checked)}
                />
                Override &amp; Allow
              </label>
            </div>
          )}

          {/* 1. Basic Information */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              01. Basic Information &amp; Visitor Contact
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Entry Date</label>
                <input type="date" className={inputCls} value={form.entry_date} onChange={(e) => updateField('entry_date', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Entry Time</label>
                <input type="time" className={inputCls} value={form.entry_time} onChange={(e) => updateField('entry_time', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Requestor Name</label>
                <input type="text" className={inputCls} value={form.requestor_name} onChange={(e) => updateField('requestor_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Requestor Employee ID</label>
                <input type="text" className={`${inputCls} font-mono`} value={form.requestor_employee_id} onChange={(e) => updateField('requestor_employee_id', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Department *</label>
                <input type="text" className={inputCls} value={form.department} onChange={(e) => updateField('department', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Visitor Full Name *</label>
                <input type="text" required placeholder="e.g. Muhammad Ali" className={inputCls} value={form.visitor_name} onChange={(e) => updateField('visitor_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Plant Host Employee *</label>
                <select
                  className={inputCls}
                  value={form.visitor_host_user_id}
                  onChange={(e) => handleHostSelect(e.target.value)}
                >
                  <option value="">Select Host Employee</option>
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.full_name} ({h.department})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Host Display Name *</label>
                <input type="text" className={inputCls} value={form.visitor_host_name} onChange={(e) => updateField('visitor_host_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Visitor Company Name *</label>
                <input type="text" required placeholder="Organization / Vendor" className={inputCls} value={form.visitor_company_name} onChange={(e) => updateField('visitor_company_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Visitor Designation</label>
                <input type="text" placeholder="Job Title" className={inputCls} value={form.visitor_designation} onChange={(e) => updateField('visitor_designation', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Visitor Contact Number *</label>
                <input type="tel" required placeholder="0300-1234567" className={`${inputCls} font-mono`} value={form.visitor_contact_number} onChange={(e) => updateField('visitor_contact_number', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Visitor Email</label>
                <input type="email" placeholder="visitor@company.com" className={inputCls} value={form.visitor_email} onChange={(e) => updateField('visitor_email', e.target.value)} />
              </div>
            </div>
          </section>

          {/* 2. Identification Details */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              02. Identification Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>CNIC Number (XXXXX-XXXXXXX-X) *</label>
                <input
                  type="text"
                  required
                  placeholder="35202-1234567-1"
                  className={`${inputCls} font-mono`}
                  value={form.cnic_number}
                  onChange={(e) => updateField('cnic_number', formatCnicInput(e.target.value))}
                />
              </div>
              <div>
                <label className={labelCls}>CNIC Expiry Date *</label>
                <input type="date" required className={inputCls} value={form.cnic_expiry_date} onChange={(e) => updateField('cnic_expiry_date', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Visitor Type *</label>
                <select className={inputCls} value={form.visitor_type} onChange={(e) => updateField('visitor_type', e.target.value as VisitorType)}>
                  {VISITOR_TYPES.map((vt) => (
                    <option key={vt} value={vt}>{vt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>CNIC Scan Upload (JPG/PNG/PDF, max 2MB)</label>
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {form.cnic_scan_data ? 'CNIC Scan Attached' : 'Upload CNIC Scan'}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'CNIC_SCAN')} />
                </label>
              </div>
              <div>
                <label className={labelCls}>Visitor Photograph Upload (JPG/PNG, max 2MB)</label>
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {form.visitor_photo_data ? 'Photo Attached' : 'Upload Visitor Photo'}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => handleFileUpload(e, 'VISITOR_PHOTO')} />
                </label>
              </div>
            </div>
          </section>

          {/* 3. Visit Details */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              03. Visit Schedule &amp; Priority
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Arrival Date *</label>
                <input type="date" className={inputCls} value={form.arrival_date} onChange={(e) => updateField('arrival_date', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Arrival Time *</label>
                <input type="time" className={inputCls} value={form.arrival_time} onChange={(e) => updateField('arrival_time', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Departure Date *</label>
                <input type="date" className={inputCls} value={form.departure_date} onChange={(e) => updateField('departure_date', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Departure Time *</label>
                <input type="time" className={inputCls} value={form.departure_time} onChange={(e) => updateField('departure_time', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Meeting Subject *</label>
                <input type="text" placeholder="Brief meeting or work order title" className={inputCls} value={form.meeting_subject} onChange={(e) => updateField('meeting_subject', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Number of Visitors *</label>
                <input type="number" min={1} max={50} className={`${inputCls} font-mono`} value={form.number_of_visitors} onChange={(e) => updateField('number_of_visitors', Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <label className={labelCls}>Duration &amp; Priority</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="4 hours" className={inputCls} value={form.duration_of_visit} onChange={(e) => updateField('duration_of_visit', e.target.value)} />
                  <select className={inputCls} value={form.priority_level} onChange={(e) => updateField('priority_level', e.target.value as PriorityLevel)}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className={labelCls}>Purpose of Visit *</label>
                <textarea rows={2} placeholder="Detailed operational purpose of plant visit..." className={inputCls} value={form.purpose_of_visit} onChange={(e) => updateField('purpose_of_visit', e.target.value)} />
              </div>
            </div>
          </section>

          {/* 4. Vehicle Information */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              04. Vehicle Information (Optional)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Vehicle Registration Number</label>
                <input type="text" placeholder="LEA-24-8812" className={`${inputCls} font-mono uppercase`} value={form.vehicle_number} onChange={(e) => updateField('vehicle_number', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className={labelCls}>Vehicle Type</label>
                <input type="text" placeholder="Sedan / Pickup / Truck" className={inputCls} value={form.vehicle_type} onChange={(e) => updateField('vehicle_type', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Driver Name</label>
                <input type="text" className={inputCls} value={form.driver_name} onChange={(e) => updateField('driver_name', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Driver CNIC</label>
                <input type="text" placeholder="XXXXX-XXXXXXX-X" className={`${inputCls} font-mono`} value={form.driver_cnic} onChange={(e) => updateField('driver_cnic', formatCnicInput(e.target.value))} />
              </div>
              <div>
                <label className={labelCls}>Vehicle Company</label>
                <input type="text" className={inputCls} value={form.vehicle_company} onChange={(e) => updateField('vehicle_company', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Planned Vehicle Entry Time</label>
                <input type="time" className={inputCls} value={form.vehicle_entry_time} onChange={(e) => updateField('vehicle_entry_time', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Planned Vehicle Exit Time</label>
                <input type="time" className={inputCls} value={form.vehicle_exit_time} onChange={(e) => updateField('vehicle_exit_time', e.target.value)} />
              </div>
            </div>
          </section>

          {/* 5. Plant Access & Safety Compliance */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              05. Plant Access Zone &amp; HSE Requirements
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Designated Visiting Area *</label>
                <input type="text" className={inputCls} value={form.visiting_area} onChange={(e) => updateField('visiting_area', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Building *</label>
                <input type="text" className={inputCls} value={form.building} onChange={(e) => updateField('building', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Floor</label>
                <input type="text" className={inputCls} value={form.floor} onChange={(e) => updateField('floor', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Specific Office / Unit</label>
                <input type="text" className={inputCls} value={form.specific_office} onChange={(e) => updateField('specific_office', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                ['restricted_area_required', 'Restricted Area Access Required'],
                ['safety_induction_required', 'Safety Induction Required'],
                ['ppe_required', 'PPE Gear Required'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key as keyof typeof form])}
                    onChange={(e) => updateField(key as keyof typeof initialForm, e.target.checked as never)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* 6. Logistics & 7. Additional Information */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              06. Logistics &amp; Additional Remarks
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['meal_required', 'Meal Required'],
                ['tea_coffee_required', 'Tea / Coffee Required'],
                ['guest_house_required', 'Guest House Required'],
                ['transportation_required', 'Plant Transport Required'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key as keyof typeof form])}
                    onChange={(e) => updateField(key as keyof typeof initialForm, e.target.checked as never)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Special Instructions</label>
                <textarea rows={2} className={inputCls} value={form.special_instructions} onChange={(e) => updateField('special_instructions', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Supporting Attachments (Work Permit / Letter)</label>
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-4 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Attach Document ({attachments.length} added)
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'DOCUMENT')} />
                </label>
              </div>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              clearDraftLocal();
              setForm(initialForm);
              setDraftSavedAt(null);
            }}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            Reset Form &amp; Clear Draft
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit('Draft')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Save as Draft
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit('Submitted')}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-amber-500 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Submitting...' : isOnline ? 'Submit Request' : 'Queue Offline Submission'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
