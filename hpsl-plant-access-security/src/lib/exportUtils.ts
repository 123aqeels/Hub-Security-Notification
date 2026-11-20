import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { VisitorRequest } from '../types';

export function exportRequestsToCSV(requests: VisitorRequest[], filename = 'hpsl_visitor_report.csv') {
  const headers = [
    'Request ID',
    'Status',
    'Visitor Name',
    'CNIC',
    'Type',
    'Company',
    'Host Name',
    'Department',
    'Arrival Date',
    'Arrival Time',
    'Departure Date',
    'Vehicle Number',
    'Visiting Area',
    'Priority',
    'Check-In Time',
    'Check-Out Time',
  ];

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = requests.map((r) => [
    r.request_number,
    r.status,
    r.visitor_name,
    r.cnic_number,
    r.visitor_type,
    r.visitor_company_name,
    r.visitor_host_name,
    r.department,
    r.arrival_date,
    r.arrival_time,
    r.departure_date,
    r.vehicle_number || '-',
    r.visiting_area,
    r.priority_level,
    r.check_in_time || '-',
    r.check_out_time || '-',
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRequestsToExcel(requests: VisitorRequest[], filename = 'hpsl_visitor_report.xlsx') {
  const sheetData = requests.map((r) => ({
    'Request ID': r.request_number,
    Status: r.status,
    'Visitor Name': r.visitor_name,
    'CNIC Number': r.cnic_number,
    'CNIC Expiry': r.cnic_expiry_date,
    'Visitor Type': r.visitor_type,
    Company: r.visitor_company_name,
    Designation: r.visitor_designation,
    Phone: r.visitor_contact_number,
    'Host Name': r.visitor_host_name,
    Department: r.department,
    'Arrival Date': r.arrival_date,
    'Arrival Time': r.arrival_time,
    'Departure Date': r.departure_date,
    'Departure Time': r.departure_time,
    'Vehicle No': r.vehicle_number || '-',
    'Visiting Area': r.visiting_area,
    Building: r.building,
    Priority: r.priority_level,
    'PPE Required': r.ppe_required ? 'Yes' : 'No',
    'Restricted Area': r.restricted_area_required ? 'Yes' : 'No',
    'Check-In Time': r.check_in_time || '-',
    'Check-Out Time': r.check_out_time || '-',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Visitor Access Log');
  XLSX.writeFile(wb, filename);
}

export function exportRequestsToPDF(
  requests: VisitorRequest[],
  reportTitle = 'HPSL Plant Access Security — Visitor Report',
  filename = 'hpsl_visitor_report.pdf'
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(reportTitle, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()} · Total Records: ${requests.length}`, 40, 56);

  autoTable(doc, {
    startY: 70,
    styles: { fontSize: 7.5, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    head: [[
      'Request ID',
      'Visitor',
      'CNIC',
      'Company',
      'Host',
      'Area',
      'Arrival',
      'Vehicle',
      'Priority',
      'Status',
    ]],
    body: requests.map((r) => [
      r.request_number,
      r.visitor_name,
      r.cnic_number,
      r.visitor_company_name,
      r.visitor_host_name,
      r.visiting_area,
      `${r.arrival_date} ${r.arrival_time}`,
      r.vehicle_number || '-',
      r.priority_level,
      r.status,
    ]),
  });

  doc.save(filename);
}
