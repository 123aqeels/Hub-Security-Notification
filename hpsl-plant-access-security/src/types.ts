export type AccessLevel = 'Admin' | 'Security Officer' | 'User';

export type RoleCode =
  | 'SECURITY_ADMIN'
  | 'SECURITY_OFFICER'
  | 'DEPT_REQUESTOR'
  | 'HOST_EMPLOYEE'
  | 'MGMT_READONLY';

export type WorkflowStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Visitor Arrived'
  | 'Checked In'
  | 'In Meeting'
  | 'Checked Out'
  | 'Closed';

export type VisitorType =
  | 'Contractor'
  | 'Vendor'
  | 'Customer'
  | 'Auditor'
  | 'Government Official'
  | 'Guest'
  | 'Other';

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Emergency';

export interface User {
  id: number;
  employee_id: string;
  username: string;
  full_name: string;
  email: string;
  department: string;
  phone: string;
  role_id: number;
  role_code: RoleCode;
  role_name: string;
  access_level: AccessLevel;
  permissions: string[];
  is_active?: number;
  failed_login_attempts?: number;
  locked_until?: string | null;
  last_login_at?: string | null;
  last_login_ip?: string | null;
}

export interface HostOption {
  id: number;
  employee_id: string;
  full_name: string;
  department: string;
  email: string;
  phone: string;
  role_code: RoleCode;
}

export interface AttachmentItem {
  id?: number;
  file_name: string;
  file_type: string;
  file_size: number;
  category: 'CNIC_SCAN' | 'VISITOR_PHOTO' | 'DOCUMENT';
  data_url: string;
  created_at?: string;
}

export interface VisitorRequest {
  id: number;
  request_number: string;
  entry_date: string;
  entry_time: string;
  requestor_user_id: number | null;
  requestor_name: string;
  department: string;
  requestor_employee_id: string;
  visitor_id: number | null;
  visitor_name: string;
  visitor_host_user_id: number | null;
  visitor_host_name: string;
  visitor_company_name: string;
  visitor_designation: string;
  visitor_contact_number: string;
  visitor_email: string;
  cnic_number: string;
  cnic_expiry_date: string;
  cnic_scan_data?: string | null;
  visitor_photo_data?: string | null;
  visitor_type: VisitorType;
  arrival_date: string;
  arrival_time: string;
  departure_date: string;
  departure_time: string;
  purpose_of_visit: string;
  meeting_subject: string;
  number_of_visitors: number;
  duration_of_visit: string;
  priority_level: PriorityLevel;
  vehicle_id?: number | null;
  vehicle_number: string;
  vehicle_type: string;
  driver_name: string;
  driver_cnic: string;
  vehicle_company: string;
  vehicle_entry_time: string;
  vehicle_exit_time: string;
  visiting_area: string;
  building: string;
  floor: string;
  specific_office: string;
  restricted_area_required: number | boolean;
  safety_induction_required: number | boolean;
  ppe_required: number | boolean;
  meal_required: number | boolean;
  tea_coffee_required: number | boolean;
  guest_house_required: number | boolean;
  transportation_required: number | boolean;
  special_instructions: string;
  security_remarks: string;
  host_remarks: string;
  status: WorkflowStatus;
  pass_code?: string | null;
  created_at: string;
  updated_at: string;
  // Joined Check-in info
  checkin_id?: number | null;
  cnic_verified?: number;
  qr_code_token?: string;
  barcode_value?: string;
  badge_number?: string;
  badge_printed?: number;
  captured_photo?: string | null;
  digital_signature?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  host_arrival_confirmed?: number;
  host_arrival_confirmed_at?: string | null;
  host_departure_confirmed?: number;
  host_departure_confirmed_at?: string | null;
  gate_notes?: string;
}

export interface NotificationItem {
  id: number;
  user_id: number | null;
  target_role: string | null;
  request_id: number | null;
  channel: 'LOCAL' | 'EMAIL' | 'SMS';
  event_type: string;
  title: string;
  message: string;
  recipient_address: string;
  delivery_status: 'PENDING' | 'SENT' | 'QUEUED_OFFLINE' | 'FAILED';
  is_read: number;
  created_at: string;
}

export interface AnalyticsData {
  securityMetrics: {
    todaysVisitors: number;
    insidePlant: number;
    approvedRequests: number;
    pendingRequests: number;
    rejectedRequests: number;
    expiredApprovals: number;
  };
  managementMetrics: {
    monthlyTrends: { month: string; total_requests: number; total_visitors: number }[];
    categoryStats: { category: string; count: number }[];
    companyWiseVisits: { company: string; visits: number; heads: number }[];
    departmentWiseVisits: { department: string; visits: number }[];
    frequentVisitors: { full_name: string; cnic_number: string; company_name: string; visitor_type: string; total_visits: number }[];
    highSecurityVisitors: {
      id: number;
      request_number: string;
      visitor_name: string;
      visitor_company_name: string;
      cnic_number: string;
      priority_level: PriorityLevel;
      visiting_area: string;
      status: WorkflowStatus;
      arrival_date: string;
    }[];
  };
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  username: string;
  role_code: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export interface LoginHistoryEntry {
  id: number;
  user_id: number | null;
  username_attempted: string;
  success: number;
  ip_address: string;
  user_agent: string;
  failure_reason: string | null;
  created_at: string;
}

export interface SystemConfigItem {
  key: string;
  value: string;
  description: string;
  updated_at: string;
  updated_by: string;
}

export interface BackupFileInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}
