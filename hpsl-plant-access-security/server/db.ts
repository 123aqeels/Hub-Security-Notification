import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BACKUP_DIR = path.resolve(DATA_DIR, 'backups');
const DB_PATH = path.resolve(DATA_DIR, 'hpsl_security.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function getDbPaths() {
  return { dataDir: DATA_DIR, backupDir: BACKUP_DIR, dbPath: DB_PATH };
}

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export const SQL_SCHEMA = `
-- 1. ROLES TABLE
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK(access_level IN ('Admin', 'Security Officer', 'User')),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NOT NULL
);

-- 3. ROLE PERMISSIONS JUNCTION TABLE
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 4. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  phone TEXT DEFAULT '',
  role_id INTEGER NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT DEFAULT NULL,
  last_login_at TEXT DEFAULT NULL,
  last_login_ip TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 5. USER SESSIONS TABLE
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. LOGIN HISTORY TABLE
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER DEFAULT NULL,
  username_attempted TEXT NOT NULL,
  success INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  failure_reason TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. VISITORS TABLE
CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  cnic_number TEXT NOT NULL UNIQUE,
  cnic_expiry_date TEXT NOT NULL,
  company_name TEXT NOT NULL,
  designation TEXT DEFAULT '',
  contact_number TEXT NOT NULL,
  email TEXT DEFAULT '',
  visitor_type TEXT NOT NULL CHECK(visitor_type IN ('Contractor', 'Vendor', 'Customer', 'Auditor', 'Government Official', 'Guest', 'Other')),
  cnic_scan_data TEXT DEFAULT NULL,
  photo_data TEXT DEFAULT NULL,
  is_blacklisted INTEGER NOT NULL DEFAULT 0,
  total_visits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. VEHICLES TABLE
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL,
  vehicle_company TEXT DEFAULT '',
  driver_name TEXT DEFAULT '',
  driver_cnic TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. VISITOR REQUESTS TABLE
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  entry_date TEXT NOT NULL,
  entry_time TEXT NOT NULL,
  requestor_user_id INTEGER DEFAULT NULL,
  requestor_name TEXT NOT NULL,
  department TEXT NOT NULL,
  requestor_employee_id TEXT NOT NULL,
  visitor_id INTEGER DEFAULT NULL,
  visitor_name TEXT NOT NULL,
  visitor_host_user_id INTEGER DEFAULT NULL,
  visitor_host_name TEXT NOT NULL,
  visitor_company_name TEXT NOT NULL,
  visitor_designation TEXT DEFAULT '',
  visitor_contact_number TEXT NOT NULL,
  visitor_email TEXT DEFAULT '',
  cnic_number TEXT NOT NULL,
  cnic_expiry_date TEXT NOT NULL,
  cnic_scan_data TEXT DEFAULT NULL,
  visitor_photo_data TEXT DEFAULT NULL,
  visitor_type TEXT NOT NULL CHECK(visitor_type IN ('Contractor', 'Vendor', 'Customer', 'Auditor', 'Government Official', 'Guest', 'Other')),
  arrival_date TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  purpose_of_visit TEXT NOT NULL,
  meeting_subject TEXT NOT NULL,
  number_of_visitors INTEGER NOT NULL DEFAULT 1 CHECK(number_of_visitors >= 1),
  duration_of_visit TEXT NOT NULL,
  priority_level TEXT NOT NULL CHECK(priority_level IN ('Low', 'Medium', 'High', 'Emergency')),
  vehicle_id INTEGER DEFAULT NULL,
  vehicle_number TEXT DEFAULT '',
  vehicle_type TEXT DEFAULT '',
  driver_name TEXT DEFAULT '',
  driver_cnic TEXT DEFAULT '',
  vehicle_company TEXT DEFAULT '',
  vehicle_entry_time TEXT DEFAULT '',
  vehicle_exit_time TEXT DEFAULT '',
  visiting_area TEXT NOT NULL,
  building TEXT NOT NULL,
  floor TEXT DEFAULT '',
  specific_office TEXT DEFAULT '',
  restricted_area_required INTEGER NOT NULL DEFAULT 0,
  safety_induction_required INTEGER NOT NULL DEFAULT 0,
  ppe_required INTEGER NOT NULL DEFAULT 0,
  meal_required INTEGER NOT NULL DEFAULT 0,
  tea_coffee_required INTEGER NOT NULL DEFAULT 0,
  guest_house_required INTEGER NOT NULL DEFAULT 0,
  transportation_required INTEGER NOT NULL DEFAULT 0,
  special_instructions TEXT DEFAULT '',
  security_remarks TEXT DEFAULT '',
  host_remarks TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN (
    'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected',
    'Visitor Arrived', 'Checked In', 'In Meeting', 'Checked Out', 'Closed'
  )),
  reviewed_by INTEGER DEFAULT NULL,
  reviewed_at TEXT DEFAULT NULL,
  approved_by INTEGER DEFAULT NULL,
  approved_at TEXT DEFAULT NULL,
  pass_code TEXT DEFAULT NULL UNIQUE,
  client_offline_id TEXT DEFAULT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requestor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL,
  FOREIGN KEY (visitor_host_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 10. CHECKIN CHECKOUT TABLE
CREATE TABLE IF NOT EXISTS checkin_checkout (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL UNIQUE,
  visitor_id INTEGER DEFAULT NULL,
  cnic_verified INTEGER NOT NULL DEFAULT 0,
  qr_code_token TEXT NOT NULL,
  barcode_value TEXT NOT NULL,
  badge_number TEXT NOT NULL,
  badge_printed INTEGER NOT NULL DEFAULT 0,
  captured_photo TEXT DEFAULT NULL,
  digital_signature TEXT DEFAULT NULL,
  checked_in_by INTEGER DEFAULT NULL,
  check_in_time TEXT DEFAULT NULL,
  vehicle_entry_time TEXT DEFAULT NULL,
  host_arrival_confirmed INTEGER NOT NULL DEFAULT 0,
  host_arrival_confirmed_at TEXT DEFAULT NULL,
  host_arrival_confirmed_by INTEGER DEFAULT NULL,
  host_departure_confirmed INTEGER NOT NULL DEFAULT 0,
  host_departure_confirmed_at TEXT DEFAULT NULL,
  host_departure_confirmed_by INTEGER DEFAULT NULL,
  checked_out_by INTEGER DEFAULT NULL,
  check_out_time TEXT DEFAULT NULL,
  vehicle_exit_time TEXT DEFAULT NULL,
  gate_notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL,
  FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (checked_out_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 11. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER DEFAULT NULL,
  target_role TEXT DEFAULT NULL,
  request_id INTEGER DEFAULT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('LOCAL', 'EMAIL', 'SMS')),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_address TEXT DEFAULT '',
  delivery_status TEXT NOT NULL DEFAULT 'SENT' CHECK(delivery_status IN ('PENDING', 'SENT', 'QUEUED_OFFLINE', 'FAILED')),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

-- 12. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER DEFAULT NULL,
  username TEXT NOT NULL,
  role_code TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  details TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 13. ATTACHMENTS TABLE
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('CNIC_SCAN', 'VISITOR_PHOTO', 'DOCUMENT')),
  data_url TEXT NOT NULL,
  uploaded_by INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 14. SYSTEM CONFIG TABLE
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT 'system'
);

-- INDEXES FOR HIGH-SPEED LOCAL QUERIES
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_arrival_date ON requests(arrival_date);
CREATE INDEX IF NOT EXISTS idx_requests_cnic ON requests(cnic_number);
CREATE INDEX IF NOT EXISTS idx_requests_vehicle ON requests(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_requests_company ON requests(visitor_company_name);
CREATE INDEX IF NOT EXISTS idx_requests_department ON requests(department);
CREATE INDEX IF NOT EXISTS idx_requests_host ON requests(visitor_host_name);
CREATE INDEX IF NOT EXISTS idx_visitors_cnic ON visitors(cnic_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_number ON vehicles(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(created_at DESC);
`;

export function initializeDatabase() {
  db.exec(SQL_SCHEMA);
  seedDatabaseIfEmpty();
}

function seedDatabaseIfEmpty() {
  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  if (roleCount > 0) return;

  const insertRole = db.prepare(
    'INSERT INTO roles (code, name, access_level, description) VALUES (?, ?, ?, ?)'
  );
  const rolesData = [
    ['SECURITY_ADMIN', 'Security Administrator', 'Admin', 'Full system access, user management, configuration, audit logs, backups, and reports.'],
    ['SECURITY_OFFICER', 'Security Officer', 'Security Officer', 'Review and approve/reject visitor requests, process gate check-in/check-out, print passes, manage gate records.'],
    ['DEPT_REQUESTOR', 'Department Requestor', 'User', 'Create and submit visitor access requests, track approval status, and receive notifications.'],
    ['HOST_EMPLOYEE', 'Host Employee', 'User', 'View incoming visitors assigned to host, confirm visitor arrival and departure, add host remarks.'],
    ['MGMT_READONLY', 'Read-Only Management', 'User', 'Executive view of visitor analytics dashboards, trends, and downloadable PDF/Excel/CSV reports.'],
  ];
  for (const r of rolesData) insertRole.run(...r);

  const insertPerm = db.prepare('INSERT INTO permissions (code, module, description) VALUES (?, ?, ?)');
  const permsData = [
    ['requests:create', 'Requests', 'Create and save visitor access requests'],
    ['requests:view_all', 'Requests', 'View all plant visitor requests'],
    ['requests:view_own', 'Requests', 'View own submitted requests'],
    ['requests:approve', 'Workflow', 'Review, approve, or reject visitor requests'],
    ['gate:checkin', 'Gate', 'Perform CNIC verification, photo/signature capture, and check-in'],
    ['gate:checkout', 'Gate', 'Record visitor & vehicle exit check-out'],
    ['gate:print_pass', 'Gate', 'Generate and print QR/Barcode visitor gate passes'],
    ['host:confirm', 'Host', 'Confirm visitor arrival and departure as host'],
    ['reports:view', 'Reports', 'View analytics dashboards and reports'],
    ['reports:export', 'Reports', 'Export PDF, Excel, and CSV reports'],
    ['admin:users', 'Admin', 'Manage user accounts, roles, and lockouts'],
    ['admin:config', 'Admin', 'Modify plant security configuration'],
    ['admin:audit', 'Admin', 'Inspect security audit trails and login history'],
    ['admin:backup', 'Admin', 'Create and restore SQLite database backups'],
  ];
  for (const p of permsData) insertPerm.run(...p);

  const roleMap = new Map<string, number>();
  for (const row of db.prepare('SELECT id, code FROM roles').all() as { id: number; code: string }[]) {
    roleMap.set(row.code, row.id);
  }
  const permMap = new Map<string, number>();
  for (const row of db.prepare('SELECT id, code FROM permissions').all() as { id: number; code: string }[]) {
    permMap.set(row.code, row.id);
  }

  const assignPerms = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
  const matrix: Record<string, string[]> = {
    SECURITY_ADMIN: permsData.map((p) => p[0]),
    SECURITY_OFFICER: [
      'requests:create', 'requests:view_all', 'requests:approve',
      'gate:checkin', 'gate:checkout', 'gate:print_pass', 'reports:view', 'reports:export',
    ],
    DEPT_REQUESTOR: ['requests:create', 'requests:view_own', 'reports:view'],
    HOST_EMPLOYEE: ['requests:view_own', 'host:confirm', 'reports:view'],
    MGMT_READONLY: ['requests:view_all', 'reports:view', 'reports:export'],
  };
  for (const [roleCode, codes] of Object.entries(matrix)) {
    const rid = roleMap.get(roleCode)!;
    for (const code of codes) {
      assignPerms.run(rid, permMap.get(code)!);
    }
  }

  // Seed Users
  const insertUser = db.prepare(`
    INSERT INTO users (employee_id, username, full_name, email, department, phone, role_id, password_hash, password_salt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedUsers = [
    ['HPSL-0001', 'admin', 'Tariq Mahmood', 'tariq.mahmood@hpsl-plant.local', 'Plant Security HQ', '+92-300-8410001', 'SECURITY_ADMIN', 'Admin@123'],
    ['HPSL-0104', 'security', 'Kamran Qureshi', 'kamran.qureshi@hpsl-plant.local', 'Main Gate Control', '+92-300-8410104', 'SECURITY_OFFICER', 'Officer@123'],
    ['HPSL-0218', 'requestor', 'Ayesha Siddiqui', 'ayesha.siddiqui@hpsl-plant.local', 'Process Engineering', '+92-321-4450218', 'DEPT_REQUESTOR', 'Requestor@123'],
    ['HPSL-0342', 'host', 'Bilal Ahmed', 'bilal.ahmed@hpsl-plant.local', 'Utilities & Power Plant', '+92-333-9120342', 'HOST_EMPLOYEE', 'Host@123'],
    ['HPSL-0409', 'management', 'Dr. Salman Raza', 'salman.raza@hpsl-plant.local', 'Executive Operations', '+92-301-5550409', 'MGMT_READONLY', 'Mgmt@123'],
    ['HPSL-0355', 'host_hse', 'Nadia Farooq', 'nadia.farooq@hpsl-plant.local', 'HSE & Compliance', '+92-302-7740355', 'HOST_EMPLOYEE', 'Host@123'],
  ];

  for (const [empId, uname, fname, email, dept, phone, rcode, pwd] of seedUsers) {
    const { hash, salt } = hashPassword(pwd);
    insertUser.run(empId, uname, fname, email, dept, phone, roleMap.get(rcode)!, hash, salt);
  }

  // Seed System Config
  const insertConfig = db.prepare('INSERT INTO system_config (key, value, description) VALUES (?, ?, ?)');
  const configs = [
    ['plant_name', 'HPSL Industrial Complex — Site A', 'Official facility name printed on gate passes and reports'],
    ['gate_identifier', 'MAIN-GATE-01', 'Primary security checkpoint identifier'],
    ['max_failed_logins', '5', 'Failed password attempts before temporary account lockout'],
    ['lockout_minutes', '15', 'Account lockout duration in minutes'],
    ['auto_backup_enabled', 'true', 'Automated daily hot SQLite backup schedule'],
    ['auto_backup_retention_days', '30', 'Days to retain local snapshot backups'],
    ['smtp_relay_host', 'localhost:25 (Offline Outbox Mode)', 'Local intranet SMTP relay for email alerts'],
    ['sms_gateway_mode', 'Modular Queue (Ready for GSM/API)', 'SMS dispatch integration mode'],
    ['pass_validity_hours', '12', 'Default validity window for approved visitor passes'],
  ];
  for (const [k, v, d] of configs) insertConfig.run(k, v, d);

  // Seed realistic Visitors, Vehicles, Requests, CheckIns, Notifications, AuditLogs
  const now = new Date();
  const fmtDate = (offsetDays: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const today = fmtDate(0);
  const yesterday = fmtDate(-1);
  const twoDaysAgo = fmtDate(-2);
  const tomorrow = fmtDate(1);
  const lastMonth = fmtDate(-25);

  const insertVisitor = db.prepare(`
    INSERT INTO visitors (full_name, cnic_number, cnic_expiry_date, company_name, designation, contact_number, email, visitor_type, total_visits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const visitors = [
    ['Muhammad Usman Khan', '35202-4819203-1', '2030-08-14', 'Siemens Pakistan Engineering', 'Lead Turbine Engineer', '0300-4129881', 'usman.khan@siemens-partner.local', 'Contractor', 6],
    ['Zainab Tariq', '35201-7721904-2', '2029-11-20', 'SGS Inspection Services', 'ISO Lead Auditor', '0321-8891204', 'zainab.tariq@sgs-audit.local', 'Auditor', 4],
    ['Faisal Mehmood', '42101-9938122-5', '2031-03-11', 'Atlas Industrial Logistics', 'Fleet Supervisor', '0333-2190443', 'faisal.m@atlaslogistics.local', 'Vendor', 9],
    ['Brig (R) Hamid Raza', '61101-3349182-7', '2028-06-30', 'Provincial EPA Directorate', 'Chief Compliance Inspector', '0301-5519201', 'h.raza@epa-gov.local', 'Government Official', 2],
    ['Sanaullah Butt', '37405-6628190-3', '2027-01-19', 'Descon Automation Pvt Ltd', 'PLC Commissioning Specialist', '0345-6182930', 'sanaullah@descon-auto.local', 'Contractor', 5],
    ['Imran Haider', '35202-1192837-9', '2030-05-02', 'PetroChem Supply Corp', 'Regional Account Director', '0300-9918273', 'imran.h@petrochem.local', 'Customer', 3],
    ['Waqas Ali', '34101-8837162-1', '2026-10-01', 'National Fire & Safety', 'Hydrant Technician', '0312-7748192', 'waqas@nfs.local', 'Vendor', 7],
    ['Farhan Javed', '35201-5543219-5', '2029-09-15', 'Engro Polymer Solutions', 'Supply Chain Manager', '0322-4410982', 'farhan.j@engropolymer.local', 'Customer', 2],
  ];
  for (const v of visitors) insertVisitor.run(...v);

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (vehicle_number, vehicle_type, vehicle_company, driver_name, driver_cnic)
    VALUES (?, ?, ?, ?, ?)
  `);
  const vehicles = [
    ['LEA-24-8812', 'Pickup 4x4', 'Siemens Pakistan Engineering', 'Rashid Ali', '35202-1029384-1'],
    ['KHI-9042', 'Box Truck (5T)', 'Atlas Industrial Logistics', 'Faisal Mehmood', '42101-9938122-5'],
    ['ICT-551', 'Official Sedan', 'Provincial EPA Directorate', 'Ghulam Mustafa', '61101-8827161-3'],
    ['LHR-7109', 'Service Van', 'Descon Automation Pvt Ltd', 'Sanaullah Butt', '37405-6628190-3'],
  ];
  for (const vh of vehicles) insertVehicle.run(...vh);

  const insertRequest = db.prepare(`
    INSERT INTO requests (
      request_number, entry_date, entry_time, requestor_user_id, requestor_name, department, requestor_employee_id,
      visitor_id, visitor_name, visitor_host_user_id, visitor_host_name, visitor_company_name, visitor_designation,
      visitor_contact_number, visitor_email, cnic_number, cnic_expiry_date, visitor_type,
      arrival_date, arrival_time, departure_date, departure_time, purpose_of_visit, meeting_subject,
      number_of_visitors, duration_of_visit, priority_level,
      vehicle_id, vehicle_number, vehicle_type, driver_name, driver_cnic, vehicle_company, vehicle_entry_time, vehicle_exit_time,
      visiting_area, building, floor, specific_office, restricted_area_required, safety_induction_required, ppe_required,
      meal_required, tea_coffee_required, guest_house_required, transportation_required,
      special_instructions, security_remarks, host_remarks, status, reviewed_by, reviewed_at, approved_by, approved_at, pass_code
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const passToken = (suffix: string) => `HPSL-PASS-${today.replace(/-/g, '')}-${suffix}`;

  const seedRequests = [
    [
      'HPSL-VR-20261120-1001', today, '08:05', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      1, 'Muhammad Usman Khan', 4, 'Bilal Ahmed', 'Siemens Pakistan Engineering', 'Lead Turbine Engineer',
      '0300-4129881', 'usman.khan@siemens-partner.local', '35202-4819203-1', '2030-08-14', 'Contractor',
      today, '09:00', today, '17:00', 'Steam turbine vibration diagnostics and governor calibration', 'Turbine Unit-2 Preventive Maintenance',
      2, '8 hours', 'High',
      1, 'LEA-24-8812', 'Pickup 4x4', 'Rashid Ali', '35202-1029384-1', 'Siemens Pakistan Engineering', '09:04', '',
      'Power House & Turbine Hall', 'Building B-02', 'Ground Floor', 'Control Bay 2', 1, 1, 1,
      1, 1, 0, 0,
      'Must wear FR coveralls, steel-toe boots, and ear protection.', 'CNIC verified at Main Gate; safety briefing completed.', 'Escort assigned for Turbine Bay.',
      'Checked In', 2, `${today}T08:25:00`, 2, `${today}T08:30:00`, passToken('1001')
    ],
    [
      'HPSL-VR-20261120-1002', today, '08:20', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      2, 'Zainab Tariq', 6, 'Nadia Farooq', 'SGS Inspection Services', 'ISO Lead Auditor',
      '0321-8891204', 'zainab.tariq@sgs-audit.local', '35201-7721904-2', '2029-11-20', 'Auditor',
      today, '10:00', today, '16:00', 'Annual ISO 45001 Occupational Health & Safety Surveillance Audit', 'ISO 45001 Surveillance Audit',
      1, '6 hours', 'High',
      null, '', '', '', '', '', '', '',
      'HSE Compliance Wing', 'Admin Block A', '2nd Floor', 'Conference Room 204', 0, 1, 0,
      1, 1, 0, 0,
      'Visitor requires escort to chemical storage perimeter during afternoon walkthrough.', 'Pre-cleared for Admin Block & HSE Lab.', 'Confirmed audit agenda.',
      'In Meeting', 2, `${today}T08:40:00`, 2, `${today}T08:45:00`, passToken('1002')
    ],
    [
      'HPSL-VR-20261120-1003', today, '08:45', 4, 'Bilal Ahmed', 'Utilities & Power Plant', 'HPSL-0342',
      3, 'Faisal Mehmood', 4, 'Bilal Ahmed', 'Atlas Industrial Logistics', 'Fleet Supervisor',
      '0333-2190443', 'faisal.m@atlaslogistics.local', '42101-9938122-5', '2031-03-11', 'Vendor',
      today, '11:30', today, '13:30', 'Delivery of high-pressure boiler feedwater valve assembly', 'Valve Spare Parts Delivery',
      2, '2 hours', 'Medium',
      2, 'KHI-9042', 'Box Truck (5T)', 'Faisal Mehmood', '42101-9938122-5', 'Atlas Industrial Logistics', '', '',
      'Central Warehouse', 'Warehouse W-04', 'Ground Floor', 'Receiving Bay 3', 0, 0, 1,
      0, 1, 0, 0,
      'Weighbridge inspection required before unloading.', 'Approved for Warehouse Gate B.', '',
      'Approved', 2, `${today}T09:00:00`, 2, `${today}T09:02:00`, passToken('1003')
    ],
    [
      'HPSL-VR-20261120-1004', today, '09:10', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      4, 'Brig (R) Hamid Raza', 6, 'Nadia Farooq', 'Provincial EPA Directorate', 'Chief Compliance Inspector',
      '0301-5519201', 'h.raza@epa-gov.local', '61101-3349182-7', '2028-06-30', 'Government Official',
      today, '13:00', today, '15:30', 'Stack emission and effluent treatment plant verification', 'Environmental Compliance Inspection',
      3, '2.5 hours', 'Emergency',
      3, 'ICT-551', 'Official Sedan', 'Ghulam Mustafa', '61101-8827161-3', 'Provincial EPA Directorate', '', '',
      'Effluent Treatment Plant', 'ETP Control Zone', 'Ground Floor', 'Lab & Stack Point 1', 1, 1, 1,
      1, 1, 0, 0,
      'Priority gate escort required by HSE Director.', '', '',
      'Submitted', null, null, null, null, null
    ],
    [
      'HPSL-VR-20261120-1005', today, '09:20', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      5, 'Sanaullah Butt', '4', 'Bilal Ahmed', 'Descon Automation Pvt Ltd', 'PLC Commissioning Specialist',
      '0345-6182930', 'sanaullah@descon-auto.local', '37405-6628190-3', '2027-01-19', 'Contractor',
      today, '12:00', today, '18:00', 'Emergency SCADA interlock firmware patch on Compressor Station', 'SCADA Interlock Update',
      1, '6 hours', 'Emergency',
      4, 'LHR-7109', 'Service Van', 'Sanaullah Butt', '37405-6628190-3', 'Descon Automation Pvt Ltd', '', '',
      'Compressor Control Room', 'Building C-01', '1st Floor', 'DCS Rack Room', 1, 1, 1,
      0, 1, 0, 0,
      'USB media scan mandatory at security desk before DCS room entry.', 'Under security vetting for restricted DCS zone.', '',
      'Under Review', 2, `${today}T09:25:00`, null, null, null
    ],
    [
      'HPSL-VR-20261120-1006', today, '07:50', 4, 'Bilal Ahmed', 'Utilities & Power Plant', 'HPSL-0342',
      6, 'Imran Haider', 4, 'Bilal Ahmed', 'PetroChem Supply Corp', 'Regional Account Director',
      '0300-9918273', 'imran.h@petrochem.local', '35202-1192837-9', '2030-05-02', 'Customer',
      today, '10:30', today, '12:30', 'Q4 feedstock supply contract alignment', 'Annual Supply Agreement Review',
      1, '2 hours', 'Low',
      null, '', '', '', '', '', '', '',
      'Executive Administration', 'Admin Block A', '3rd Floor', 'Boardroom 301', 0, 0, 0,
      0, 1, 0, 0,
      'Waiting at Main Gate reception.', 'Visitor arrived at Gate 1 reception.', '',
      'Visitor Arrived', 2, `${today}T08:00:00`, 2, `${today}T08:05:00`, passToken('1006')
    ],
    [
      'HPSL-VR-20261119-0991', yesterday, '09:00', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      7, 'Waqas Ali', 6, 'Nadia Farooq', 'National Fire & Safety', 'Hydrant Technician',
      '0312-7748192', 'waqas@nfs.local', '34101-8837162-1', '2026-10-01', 'Vendor',
      yesterday, '10:00', yesterday, '16:00', 'Fire hydrant pressure testing across Tank Farm', 'Quarterly Hydrant Pressure Test',
      2, '6 hours', 'Medium',
      null, '', '', '', '', '', '', '',
      'Tank Farm Perimeter', 'Safety Zone S-1', 'Outdoor', 'Hydrant Loop B', 1, 1, 1,
      0, 1, 0, 0,
      'Work permit #PTW-882 attached.', 'Rejected: Visitor CNIC expired on 2026-10-01. Renewal required.', '',
      'Rejected', 2, `${yesterday}T09:15:00`, null, null, null
    ],
    [
      'HPSL-VR-20261118-0974', twoDaysAgo, '08:30', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      8, 'Farhan Javed', 4, 'Bilal Ahmed', 'Engro Polymer Solutions', 'Supply Chain Manager',
      '0322-4410982', 'farhan.j@engropolymer.local', '35201-5543219-5', '2029-09-15', 'Customer',
      twoDaysAgo, '09:30', twoDaysAgo, '14:00', 'Bulk resin dispatch scheduling and packaging audit', 'Dispatch Operations Audit',
      1, '4.5 hours', 'Low',
      null, '', '', '', '', '', '', '',
      'Packaging & Dispatch', 'Building D-01', 'Ground Floor', 'Logistics Office', 0, 0, 1,
      1, 1, 0, 0,
      'Completed without incident.', 'Badge returned at Main Gate.', 'Departure confirmed by host.',
      'Closed', 2, `${twoDaysAgo}T08:40:00`, 2, `${twoDaysAgo}T08:45:00`, `HPSL-PASS-${twoDaysAgo.replace(/-/g, '')}-0974`
    ],
    [
      'HPSL-VR-20261119-0995', yesterday, '13:00', 4, 'Bilal Ahmed', 'Utilities & Power Plant', 'HPSL-0342',
      1, 'Muhammad Usman Khan', 4, 'Bilal Ahmed', 'Siemens Pakistan Engineering', 'Lead Turbine Engineer',
      '0300-4129881', 'usman.khan@siemens-partner.local', '35202-4819203-1', '2030-08-14', 'Contractor',
      yesterday, '14:00', yesterday, '17:00', 'Pre-maintenance walkdown for Unit-2', 'Turbine Walkdown',
      1, '3 hours', 'Medium',
      1, 'LEA-24-8812', 'Pickup 4x4', 'Rashid Ali', '35202-1029384-1', 'Siemens Pakistan Engineering', '14:02', '17:10',
      'Power House & Turbine Hall', 'Building B-02', 'Ground Floor', 'Control Bay 2', 1, 1, 1,
      0, 1, 0, 0,
      '', 'Checked out cleanly.', 'Confirmed exit.',
      'Checked Out', 2, `${yesterday}T13:10:00`, 2, `${yesterday}T13:12:00`, `HPSL-PASS-${yesterday.replace(/-/g, '')}-0995`
    ],
    [
      'HPSL-VR-20261025-0812', lastMonth, '09:00', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      3, 'Faisal Mehmood', 4, 'Bilal Ahmed', 'Atlas Industrial Logistics', 'Fleet Supervisor',
      '0333-2190443', 'faisal.m@atlaslogistics.local', '42101-9938122-5', '2031-03-11', 'Vendor',
      lastMonth, '10:00', lastMonth, '12:00', 'Catalyst drum delivery', 'Catalyst Delivery',
      1, '2 hours', 'Medium',
      2, 'KHI-9042', 'Box Truck (5T)', 'Faisal Mehmood', '42101-9938122-5', 'Atlas Industrial Logistics', '', '',
      'Central Warehouse', 'Warehouse W-04', 'Ground Floor', 'Receiving Bay 1', 0, 0, 1,
      0, 0, 0, 0,
      'Approval expired without visitor arrival.', 'Auto-flagged as expired approval.', '',
      'Approved', 2, `${lastMonth}T09:10:00`, 2, `${lastMonth}T09:12:00`, `HPSL-PASS-${lastMonth.replace(/-/g, '')}-0812`
    ],
    [
      'HPSL-VR-20261121-1010', tomorrow, '10:00', 3, 'Ayesha Siddiqui', 'Process Engineering', 'HPSL-0218',
      5, 'Sanaullah Butt', 4, 'Bilal Ahmed', 'Descon Automation Pvt Ltd', 'PLC Commissioning Specialist',
      '0345-6182930', 'sanaullah@descon-auto.local', '37405-6628190-3', '2027-01-19', 'Contractor',
      tomorrow, '09:30', tomorrow, '16:30', 'Draft request for scheduled DCS backup testing', 'DCS Failover Drill',
      2, '7 hours', 'Medium',
      null, '', '', '', '', '', '', '',
      'Compressor Control Room', 'Building C-01', '1st Floor', 'DCS Rack Room', 1, 1, 1,
      1, 1, 0, 0,
      'Awaiting final engineer names.', '', '',
      'Draft', null, null, null, null, null
    ]
  ];

  for (const r of seedRequests) {
    insertRequest.run(...r);
  }

  // Seed Check-in records for Checked In, In Meeting, Checked Out, Closed
  const insertCheckIn = db.prepare(`
    INSERT INTO checkin_checkout (
      request_id, visitor_id, cnic_verified, qr_code_token, barcode_value, badge_number, badge_printed,
      checked_in_by, check_in_time, vehicle_entry_time, host_arrival_confirmed, host_arrival_confirmed_at,
      host_arrival_confirmed_by, host_departure_confirmed, host_departure_confirmed_at, host_departure_confirmed_by,
      checked_out_by, check_out_time, vehicle_exit_time, gate_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCheckIn.run(
    1, 1, 1, passToken('1001'), 'HPSL1001', 'GATE-B-041', 1,
    2, `${today}T09:04:00`, `${today}T09:04:00`, 1, `${today}T09:09:00`, 4,
    0, null, null, null, null, null, 'CNIC original inspected. Hardhat & FR suit verified.'
  );
  insertCheckIn.run(
    2, 2, 1, passToken('1002'), 'HPSL1002', 'GATE-A-019', 1,
    2, `${today}T09:52:00`, '', 1, `${today}T09:58:00`, 6,
    0, null, null, null, null, null, 'Audit escort Nadia Farooq met visitor at Admin reception.'
  );
  insertCheckIn.run(
    8, 8, 1, `HPSL-PASS-${twoDaysAgo.replace(/-/g, '')}-0974`, 'HPSL0974', 'GATE-A-004', 1,
    2, `${twoDaysAgo}T09:28:00`, '', 1, `${twoDaysAgo}T09:32:00`, 4,
    1, `${twoDaysAgo}T13:55:00`, 4, 2, `${twoDaysAgo}T14:04:00`, '', 'Badge returned.'
  );
  insertCheckIn.run(
    9, 1, 1, `HPSL-PASS-${yesterday.replace(/-/g, '')}-0995`, 'HPSL0995', 'GATE-B-038', 1,
    2, `${yesterday}T14:02:00`, `${yesterday}T14:02:00`, 1, `${yesterday}T14:06:00`, 4,
    1, `${yesterday}T17:02:00`, 4, 2, `${yesterday}T17:10:00`, `${yesterday}T17:10:00`, 'Vehicle inspected on exit.'
  );

  // Seed Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, target_role, request_id, channel, event_type, title, message, recipient_address, delivery_status, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertNotif.run(4, 'HOST_EMPLOYEE', 1, 'LOCAL', 'VISITOR_ARRIVAL', 'Visitor Checked In: Muhammad Usman Khan', 'Siemens Pakistan Engineering visitor checked in at Main Gate for Turbine Unit-2 Preventive Maintenance.', 'bilal.ahmed@hpsl-plant.local', 'SENT', 0);
  insertNotif.run(2, 'SECURITY_OFFICER', 4, 'LOCAL', 'NEW_REQUEST', 'Emergency Priority Request Submitted', 'HPSL-VR-20261120-1004 (Provincial EPA Directorate) requires immediate security review.', 'kamran.qureshi@hpsl-plant.local', 'SENT', 0);
  insertNotif.run(4, 'HOST_EMPLOYEE', 6, 'LOCAL', 'VISITOR_ARRIVED_GATE', 'Visitor Waiting at Gate: Imran Haider', 'PetroChem Supply Corp visitor has arrived at Gate 1 Reception for Boardroom 301.', 'bilal.ahmed@hpsl-plant.local', 'SENT', 0);
  insertNotif.run(3, 'DEPT_REQUESTOR', 7, 'EMAIL', 'REQUEST_REJECTED', 'Visitor Request Rejected: Waqas Ali', 'Request HPSL-VR-20261119-0991 rejected due to expired CNIC (2026-10-01).', 'ayesha.siddiqui@hpsl-plant.local', 'QUEUED_OFFLINE', 1);

  // Seed Audit Logs
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (user_id, username, role_code, action, entity_type, entity_id, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAudit.run(1, 'admin', 'SECURITY_ADMIN', 'SYSTEM_INIT', 'SYSTEM', 'HPSL-DB', 'Initialized SQLite schema, RBAC roles, and security policies.', '127.0.0.1', 'HPSL-Server');
  insertAudit.run(2, 'security', 'SECURITY_OFFICER', 'APPROVE_REQUEST', 'REQUEST', 'HPSL-VR-20261120-1001', 'Approved high-priority contractor access with mandatory PPE and safety induction.', '10.14.2.18', 'Gate-Terminal-01');
  insertAudit.run(2, 'security', 'SECURITY_OFFICER', 'CHECK_IN_VISITOR', 'CHECKIN', 'HPSL-VR-20261120-1001', 'CNIC 35202-4819203-1 verified; issued badge GATE-B-041.', '10.14.2.18', 'Gate-Terminal-01');
  insertAudit.run(2, 'security', 'SECURITY_OFFICER', 'REJECT_REQUEST', 'REQUEST', 'HPSL-VR-20261119-0991', 'Rejected expired CNIC 34101-8837162-1.', '10.14.2.18', 'Gate-Terminal-01');
}

export async function createDatabaseBackup(label = 'manual'): Promise<{ fileName: string; filePath: string; sizeBytes: number }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `hpsl_backup_${safeLabel}_${stamp}.db`;
  const filePath = path.join(BACKUP_DIR, fileName);
  await db.backup(filePath);
  const stat = fs.statSync(filePath);
  return { fileName, filePath, sizeBytes: stat.size };
}

export async function ensureDailyAutoBackup() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const prefix = `hpsl_backup_daily_${todayStr}`;
  const files = fs.readdirSync(BACKUP_DIR);
  const alreadyDone = files.some((f) => f.startsWith(prefix));
  if (!alreadyDone) {
    try {
      await createDatabaseBackup('daily');
    } catch (err) {
      console.error('Daily auto-backup error:', err);
    }
  }
}
