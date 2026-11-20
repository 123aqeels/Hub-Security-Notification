import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  Camera,
  CheckCircle2,
  LogIn,
  LogOut,
  Printer,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { fileToDataUrl, isCnicExpired } from '../lib/validation';
import type { VisitorRequest } from '../types';
import { StatusIndicator } from './StatusIndicator';

interface GateCheckInViewProps {
  requests: VisitorRequest[];
  initialRequest?: VisitorRequest | null;
  onRefresh: () => void;
}

export const GateCheckInView: React.FC<GateCheckInViewProps> = ({
  requests,
  initialRequest,
  onRefresh,
}) => {
  const gateEligible = requests.filter((r) =>
    ['Approved', 'Visitor Arrived', 'Checked In', 'In Meeting', 'Checked Out'].includes(r.status)
  );

  const [selectedId, setSelectedId] = useState<number | null>(
    initialRequest?.id ?? gateEligible[0]?.id ?? null
  );
  const activeReq =
    requests.find((r) => r.id === selectedId) ?? gateEligible[0] ?? null;

  const [cnicVerified, setCnicVerified] = useState(false);
  const [gateNotes, setGateNotes] = useState('');
  const [vehicleTime, setVehicleTime] = useState(new Date().toTimeString().slice(0, 5));
  const [capturedPhoto, setCapturedPhoto] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPrintBadge, setShowPrintBadge] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (initialRequest) setSelectedId(initialRequest.id);
  }, [initialRequest]);

  useEffect(() => {
    if (!activeReq) return;
    setCnicVerified(Boolean(activeReq.cnic_verified));
    setGateNotes(activeReq.gate_notes || '');
    setCapturedPhoto(activeReq.captured_photo || activeReq.visitor_photo_data || '');

    const qrPayload = JSON.stringify({
      req: activeReq.request_number,
      pass: activeReq.pass_code || activeReq.qr_code_token || 'HPSL-PASS',
      cnic: activeReq.cnic_number,
      visitor: activeReq.visitor_name,
      zone: activeReq.visiting_area,
    });
    QRCode.toDataURL(qrPayload, { width: 160, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [activeReq?.id, activeReq?.pass_code, activeReq?.status]);

  useEffect(() => {
    if (!activeReq || !barcodeSvgRef.current) return;
    const codeVal = (activeReq.barcode_value || activeReq.request_number.replace(/[^A-Z0-9]/g, '').slice(-10));
    try {
      JsBarcode(barcodeSvgRef.current, codeVal, {
        format: 'CODE128',
        width: 1.6,
        height: 40,
        displayValue: true,
        fontSize: 11,
        margin: 4,
      });
    } catch {
      // ignore invalid barcode chars
    }
  }, [activeReq?.id, showPrintBadge]);

  // Camera handling
  const startCamera = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setErrorMsg('Camera unavailable or permission denied. Use photo upload instead.');
    }
  };

  const snapPhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85));
    }
    const stream = videoRef.current.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  };

  // Signature pad handlers
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const handleSigDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    isDrawingRef.current = true;
  };

  const handleSigMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handleSigUp = () => {
    isDrawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleCheckIn = async () => {
    if (!activeReq) return;
    setErrorMsg(null);
    setStatusMsg(null);
    if (!cnicVerified) {
      setErrorMsg('Physical CNIC verification checkbox is mandatory before gate check-in.');
      return;
    }

    const sigData = sigCanvasRef.current?.toDataURL('image/png') || '';

    const res = await fetch(`/api/checkin/${activeReq.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cnic_verified: true,
        captured_photo: capturedPhoto || null,
        digital_signature: sigData,
        vehicle_entry_time: vehicleTime,
        badge_printed: true,
        gate_notes: gateNotes,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Gate check-in failed.');
      return;
    }
    setStatusMsg(`Visitor ${activeReq.visitor_name} checked in. Badge ${data.checkin.badge_number} issued.`);
    onRefresh();
  };

  const handleCheckOut = async (closeRecord: boolean) => {
    if (!activeReq) return;
    setErrorMsg(null);
    setStatusMsg(null);
    const res = await fetch(`/api/checkout/${activeReq.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicle_exit_time: new Date().toTimeString().slice(0, 5),
        gate_notes: gateNotes,
        close_record: closeRecord,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Check-out failed.');
      return;
    }
    setStatusMsg(`Visitor checked out. Record status: ${data.status}.`);
    onRefresh();
  };

  const handlePrintPass = async () => {
    if (!activeReq) return;
    setShowPrintBadge(true);
    await fetch(`/api/checkin/${activeReq.id}/print`, { method: 'POST' });
    setTimeout(() => window.print(), 250);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Security Gate Check-In, Verification &amp; Badge Pass
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Verify CNIC credentials, capture visitor photo &amp; signature, issue QR/Barcode badges, and log vehicle exits
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Gate Queue List */}
        <section className="no-print lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Gate Queue ({gateEligible.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {gateEligible.length === 0 ? (
              <p className="p-6 text-xs text-slate-500">No approved or active visitors at gate.</p>
            ) : (
              gateEligible.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(r.id);
                    setStatusMsg(null);
                    setErrorMsg(null);
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                    activeReq?.id === r.id
                      ? 'bg-amber-50/70 dark:bg-amber-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {r.request_number}
                    </span>
                    <StatusIndicator status={r.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {r.visitor_name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {r.visitor_company_name} · {r.cnic_number}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Right Check-In & Badge Console */}
        <section className="lg:col-span-8 space-y-6">
          {!activeReq ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500">
              Select a visitor pass from the gate queue to verify and process entry.
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="no-print rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/50 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                  {errorMsg}
                </div>
              )}
              {statusMsg && (
                <div className="no-print rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
                  {statusMsg}
                </div>
              )}

              {/* Verification & Biometric Capture Card */}
              <div className="no-print rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {activeReq.visitor_name}
                      </h2>
                      <StatusIndicator status={activeReq.status} />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {activeReq.visitor_company_name} · Host: {activeReq.visitor_host_name} · Zone: {activeReq.visiting_area}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">{activeReq.request_number}</p>
                    <p className="text-slate-500 dark:text-slate-400">Pass: {activeReq.pass_code || 'PENDING'}</p>
                  </div>
                </div>

                {/* CNIC Verification */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/60">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      CNIC Identity Verification
                    </p>
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {activeReq.cnic_number}
                      <span className={`ml-2 text-xs font-normal ${isCnicExpired(activeReq.cnic_expiry_date) ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        (Expires: {activeReq.cnic_expiry_date})
                      </span>
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cnicVerified}
                      onChange={(e) => setCnicVerified(e.target.checked)}
                    />
                    Original CNIC Physically Verified
                  </label>
                </div>

                {/* Photo & Digital Signature */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Photo Capture */}
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Gate Photograph Capture
                    </label>
                    <div className="h-44 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                      {cameraActive ? (
                        <video ref={videoRef} className="w-full h-full object-cover" muted />
                      ) : capturedPhoto ? (
                        <img
                          src={capturedPhoto}
                          alt="Captured visitor"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">No photograph captured</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!cameraActive ? (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Open Camera
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={snapPhoto}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                        >
                          Capture Frame
                        </button>
                      )}
                      <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        Upload Photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) setCapturedPhoto(await fileToDataUrl(f));
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Signature Capture */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Visitor Digital Signature
                      </label>
                      <button
                        type="button"
                        onClick={clearSignature}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Clear
                      </button>
                    </div>
                    <canvas
                      ref={sigCanvasRef}
                      width={340}
                      height={176}
                      onPointerDown={handleSigDown}
                      onPointerMove={handleSigMove}
                      onPointerUp={handleSigUp}
                      onPointerLeave={handleSigUp}
                      className="w-full h-44 rounded-lg border border-slate-300 dark:border-slate-700 bg-white touch-none cursor-crosshair"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sign inside the box to acknowledge HPSL plant HSE safety rules.
                    </p>
                  </div>
                </div>

                {/* Vehicle & Gate Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle Entry Time ({activeReq.vehicle_number || 'Pedestrian'})
                    </label>
                    <input
                      type="time"
                      value={vehicleTime}
                      onChange={(e) => setVehicleTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Gate Officer Notes
                    </label>
                    <input
                      type="text"
                      value={gateNotes}
                      onChange={(e) => setGateNotes(e.target.value)}
                      placeholder="PPE check, escort badge #, equipment notes..."
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  {['Approved', 'Visitor Arrived'].includes(activeReq.status) && (
                    <button
                      type="button"
                      onClick={handleCheckIn}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      Verify &amp; Check In Visitor
                    </button>
                  )}

                  {['Checked In', 'In Meeting'].includes(activeReq.status) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCheckOut(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-amber-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        Record Check-Out
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCheckOut(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Check Out &amp; Close Record
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handlePrintPass}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 ml-auto cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Print Visitor Pass
                  </button>
                </div>
              </div>

              {/* Printable Gate Pass Badge Preview */}
              <div className="rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white text-slate-900 p-6 max-w-lg mx-auto">
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-6 h-6 text-amber-600" />
                    <div>
                      <p className="text-sm font-bold tracking-tight">HPSL PLANT VISITOR PASS</p>
                      <p className="text-[11px] text-slate-600">Site A · Authorized Gate Entry</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold border border-slate-900 px-2 py-0.5 rounded">
                    {activeReq.badge_number || `GATE-${String(activeReq.id).padStart(4, '0')}`}
                  </span>
                </div>

                <div className="mt-4 flex gap-4 items-start">
                  <div className="w-24 h-28 rounded border border-slate-300 bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center">
                    {capturedPhoto ? (
                      <img src={capturedPhoto} alt="Badge portrait" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-500 text-center px-1">Photo Pending</span>
                    )}
                  </div>
                  <div className="flex-1 text-xs space-y-1">
                    <p className="text-base font-bold text-slate-900">{activeReq.visitor_name}</p>
                    <p className="font-medium text-slate-700">{activeReq.visitor_company_name}</p>
                    <p className="font-mono text-slate-600">CNIC: {activeReq.cnic_number}</p>
                    <p className="text-slate-600">Host: {activeReq.visitor_host_name}</p>
                    <p className="text-slate-600">Zone: {activeReq.visiting_area}</p>
                    <p className="font-mono text-slate-600">
                      Valid: {activeReq.arrival_date} ({activeReq.arrival_time} - {activeReq.departure_time})
                    </p>
                  </div>
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="Visitor QR Code" className="w-20 h-20 border border-slate-200 rounded shrink-0" />
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <svg ref={barcodeSvgRef} className="max-w-[220px]" />
                  <div className="text-right text-[10px] text-slate-500">
                    <p>PPE: {activeReq.ppe_required ? 'MANDATORY' : 'STANDARD'}</p>
                    <p>RESTRICTED: {activeReq.restricted_area_required ? 'ESCORT REQ' : 'NO'}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
