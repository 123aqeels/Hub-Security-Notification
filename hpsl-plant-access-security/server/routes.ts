import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Response } from 'express';
import {
  authenticateCredentials,
  clearSessionCookie,
  logAudit,
  requireAuth,
  requirePermission,
  setSessionCookie,
  type AuthedRequest,
} from './auth.ts';
import { createDatabaseBackup, db, getDbPaths, hashPassword } from './db.ts';
import { dispatchLifecycleNotifications } from './notifications.ts';

const CNIC_REGEX = /^\d{5}-\d{7}-\d$/;

const VALID_VISITOR_TYPES = new Set([
  'Contractor',
  'Vendor',
  'Customer',
  'Auditor',
  'Government Official',
  'Guest',
  'Other',
]);
const VALID_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Emergency']);
const VALID_STATUSES = new Set([
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
]);

function generateRequestNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = String(Math.floor(1000 + Math.random() * 9000));
  return `HPSL-VR-${datePart}-${randPart}`;
}

function generatePassCode(): string {
  return `HPSL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function validateRequestPayload(body: Record<string, unknown>, isDraft: boolean): string | null {
  if (!isDraft) {
    const requiredFields: [string, string][] = [
      ['visitor_name', 'Visitor Name'],
      ['visitor_host_name', 'Visitor Host Name'],
      ['visitor_company_name', 'Visitor Company Name'],
      ['visitor_contact_number', 'Visitor Contact Number'],
      ['cnic_number', 'CNIC Number'],
      ['cnic_expiry_date', 'CNIC Expiry Date'],
      ['arrival_date', 'Arrival Date'],
      ['arrival_time', 'Arrival Time'],
      ['departure_date', 'Departure Date'],
      ['departure_time', 'Departure Time'],
      ['purpose_of_visit', 'Purpose of Visit'],
      ['meeting_subject', 'Meeting Subject'],
      ['visiting_area', 'Designated Visiting Area'],
      ['building', 'Building'],
    ];
    for (const [key, label] of requiredFields) {
      if (!String(body[key] || '').trim()) {
        return `${label} is mandatory.`;
      }
    }
  }

  const cnic = String(body.cnic_number || '').trim();
  if (cnic && !CNIC_REGEX.test(cnic)) {
    return 'CNIC format must be XXXXX-XXXXXXX-X (e.g., 35202-1234567-1).';
  }

  const driverCnic = String(body.driver_cnic || '').trim();
  if (driverCnic && !CNIC_REGEX.test(driverCnic)) {
    return 'Driver CNIC format must be XXXXX-XXXXXXX-X.';
  }

  const arrivalDate = String(body.arrival_date || '');
  const departureDate = String(body.departure_date || '');
  if (arrivalDate && departureDate && departureDate < arrivalDate) {
    return 'Departure date cannot be earlier than arrival date.';
  }

  const visitorType = String(body.visitor_type || 'Contractor');
  if (!VALID_VISITOR_TYPES.has(visitorType)) {
    return 'Invalid visitor type.';
  }

  const priority = String(body.priority_level || 'Medium');
  if (!VALID_PRIORITIES.has(priority)) {
    return 'Invalid priority level.';
  }

  return null;
}

export function createApiRouter() {
  const router = express.Router();

  // Health check for offline/online detection
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'HPSL-Security-Server', timestamp: new Date().toISOString() });
  });

  // ---------------- AUTH ROUTES ----------------
  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }
    const result = authenticateCredentials(String(username), String(password), req);
    if (!result.ok || !result.user || !result.signedCookie) {
      res.status(401).json({ error: result.error || 'Authentication failed.', lockedUntil: result.lockedUntil });
      return;
    }
    setSessionCookie(res, result.signedCookie);
    res.json({ user: result.user });
  });

  router.post('/auth/logout', requireAuth, (req: AuthedRequest, res: Response) => {
    if (req.sessionId) {
      db.prepare("UPDATE user_sessions SET revoked_at = datetime('now') WHERE id = ?").run(req.sessionId);
    }
    logAudit({
      user: req.user,
      action: 'LOGOUT',
      entityType: 'SESSION',
      entityId: req.sessionId,
      details: 'User signed out',
      req,
    });
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  router.get('/hosts', requireAuth, (_req: AuthedRequest, res: Response) => {
    const hosts = db.prepare(`
      SELECT u.id, u.employee_id, u.full_name, u.department, u.email, u.phone, r.code as role_code
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.is_active = 1
      ORDER BY u.full_name ASC
    `).all();
    res.json({ hosts });
  });

  // ---------------- DUPLICATE CHECK ----------------
  router.get('/check-duplicate', requireAuth, (req: AuthedRequest, res: Response) => {
    const cnic = String(req.query.cnic || '').trim();
    const vehicle = String(req.query.vehicle || '').trim().toUpperCase();
    const arrivalDate = String(req.query.arrival_date || new Date().toISOString().slice(0, 10));

    let duplicateVisitorRequest = null;
    let knownVisitor = null;
    if (cnic) {
      knownVisitor = db.prepare('SELECT id, full_name, company_name, total_visits, is_blacklisted, cnic_expiry_date FROM visitors WHERE cnic_number = ?').get(cnic) || null;
      duplicateVisitorRequest = db.prepare(`
        SELECT id, request_number, visitor_name, status, arrival_date
        FROM requests
        WHERE cnic_number = ? AND arrival_date = ? AND status NOT IN ('Rejected', 'Checked Out', 'Closed')
        LIMIT 1
      `).get(cnic, arrivalDate) || null;
    }

    let duplicateVehicleRequest = null;
    let knownVehicle = null;
    if (vehicle) {
      knownVehicle = db.prepare('SELECT id, vehicle_number, vehicle_type, vehicle_company, driver_name FROM vehicles WHERE upper(vehicle_number) = ?').get(vehicle) || null;
      duplicateVehicleRequest = db.prepare(`
        SELECT id, request_number, vehicle_number, status, arrival_date
        FROM requests
        WHERE upper(vehicle_number) = ? AND arrival_date = ? AND status NOT IN ('Rejected', 'Checked Out', 'Closed')
        LIMIT 1
      `).get(vehicle, arrivalDate) || null;
    }

    res.json({ knownVisitor, duplicateVisitorRequest, knownVehicle, duplicateVehicleRequest });
  });

  // ---------------- REQUESTS ROUTES ----------------
  router.get('/requests', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const visitorType = String(req.query.visitor_type || '').trim();
    const priority = String(req.query.priority || '').trim();
    const department = String(req.query.department || '').trim();
    const company = String(req.query.company || '').trim();
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;

    const where: string[] = ['1=1'];
    const params: unknown[] = [];

    // RBAC scope
    if (user.role_code === 'DEPT_REQUESTOR') {
      where.push('(r.requestor_user_id = ? OR r.department = ?)');
      params.push(user.id, user.department);
    } else if (user.role_code === 'HOST_EMPLOYEE') {
      where.push('(r.visitor_host_user_id = ? OR lower(r.visitor_host_name) = lower(?) OR r.requestor_user_id = ?)');
      params.push(user.id, user.full_name, user.id);
    }

    if (q) {
      where.push(`(
        lower(r.visitor_name) LIKE ? OR
        lower(r.cnic_number) LIKE ? OR
        lower(r.vehicle_number) LIKE ? OR
        lower(r.request_number) LIKE ? OR
        lower(r.visitor_host_name) LIKE ? OR
        lower(r.visitor_company_name) LIKE ?
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }
    if (status) {
      where.push('r.status = ?');
      params.push(status);
    }
    if (visitorType) {
      where.push('r.visitor_type = ?');
      params.push(visitorType);
    }
    if (priority) {
      where.push('r.priority_level = ?');
      params.push(priority);
    }
    if (department) {
      where.push('lower(r.department) LIKE ?');
      params.push(`%${department.toLowerCase()}%`);
    }
    if (company) {
      where.push('lower(r.visitor_company_name) LIKE ?');
      params.push(`%${company.toLowerCase()}%`);
    }
    if (dateFrom) {
      where.push('r.arrival_date >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('r.arrival_date <= ?');
      params.push(dateTo);
    }

    const whereSql = where.join(' AND ');
    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM requests r WHERE ${whereSql}`).get(...params) as { total: number };

    const rows = db.prepare(`
      SELECT r.*,
        c.id as checkin_id, c.cnic_verified, c.qr_code_token, c.barcode_value, c.badge_number,
        c.badge_printed, c.captured_photo, c.digital_signature, c.check_in_time, c.check_out_time,
        c.host_arrival_confirmed, c.host_arrival_confirmed_at, c.host_departure_confirmed, c.host_departure_confirmed_at,
        c.gate_notes
      FROM requests r
      LEFT JOIN checkin_checkout c ON c.request_id = r.id
      WHERE ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      requests: rows,
      total: totalRow.total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalRow.total / limit)),
    });
  });

  router.get('/requests/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const requestRow = db.prepare(`
      SELECT r.*,
        c.id as checkin_id, c.cnic_verified, c.qr_code_token, c.barcode_value, c.badge_number,
        c.badge_printed, c.captured_photo, c.digital_signature, c.check_in_time, c.check_out_time,
        c.host_arrival_confirmed, c.host_arrival_confirmed_at, c.host_departure_confirmed, c.host_departure_confirmed_at,
        c.gate_notes
      FROM requests r
      LEFT JOIN checkin_checkout c ON c.request_id = r.id
      WHERE r.id = ?
    `).get(id);

    if (!requestRow) {
      res.status(404).json({ error: 'Visitor request not found.' });
      return;
    }

    const attachments = db.prepare('SELECT id, file_name, file_type, file_size, category, data_url, created_at FROM attachments WHERE request_id = ?').all(id);
    res.json({ request: requestRow, attachments });
  });

  router.post('/requests', requireAuth, requirePermission('requests:create'), (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const body = req.body || {};
    const targetStatus = body.status === 'Draft' ? 'Draft' : 'Submitted';
    const isDraft = targetStatus === 'Draft';

    if (body.client_offline_id) {
      const existingOffline = db.prepare('SELECT * FROM requests WHERE client_offline_id = ?').get(String(body.client_offline_id));
      if (existingOffline) {
        res.status(200).json({ request: existingOffline, deduplicated: true });
        return;
      }
    }

    const validationError = validateRequestPayload(body, isDraft);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const cnic = String(body.cnic_number || '').trim();
    const arrivalDate = String(body.arrival_date || new Date().toISOString().slice(0, 10));

    // Duplicate & blacklist checks on non-draft submission
    if (!isDraft && cnic) {
      const blacklisted = db.prepare('SELECT is_blacklisted FROM visitors WHERE cnic_number = ?').get(cnic) as { is_blacklisted: number } | undefined;
      if (blacklisted?.is_blacklisted) {
        res.status(409).json({ error: `Visitor with CNIC ${cnic} is flagged on the plant security watchlist.` });
        return;
      }
      if (!body.allow_duplicate) {
        const dupVisitor = db.prepare(`
          SELECT request_number FROM requests
          WHERE cnic_number = ? AND arrival_date = ? AND status NOT IN ('Rejected', 'Checked Out', 'Closed')
        `).get(cnic, arrivalDate) as { request_number: string } | undefined;
        if (dupVisitor) {
          res.status(409).json({
            error: `Active visitor request (${dupVisitor.request_number}) already exists for CNIC ${cnic} on ${arrivalDate}.`,
            code: 'DUPLICATE_VISITOR',
          });
          return;
        }
      }
    }

    // Upsert visitor master record
    let visitorId: number | null = null;
    if (cnic && body.visitor_name) {
      const existingVisitor = db.prepare('SELECT id FROM visitors WHERE cnic_number = ?').get(cnic) as { id: number } | undefined;
      if (existingVisitor) {
        visitorId = existingVisitor.id;
        db.prepare(`
          UPDATE visitors SET
            full_name = ?, cnic_expiry_date = ?, company_name = ?, designation = ?,
            contact_number = ?, email = ?, visitor_type = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          String(body.visitor_name).trim(),
          String(body.cnic_expiry_date || '2030-01-01'),
          String(body.visitor_company_name || 'External'),
          String(body.visitor_designation || ''),
          String(body.visitor_contact_number || ''),
          String(body.visitor_email || ''),
          String(body.visitor_type || 'Contractor'),
          visitorId
        );
      } else {
        const vRes = db.prepare(`
          INSERT INTO visitors (full_name, cnic_number, cnic_expiry_date, company_name, designation, contact_number, email, visitor_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          String(body.visitor_name).trim(),
          cnic,
          String(body.cnic_expiry_date || '2030-01-01'),
          String(body.visitor_company_name || 'External'),
          String(body.visitor_designation || ''),
          String(body.visitor_contact_number || ''),
          String(body.visitor_email || ''),
          String(body.visitor_type || 'Contractor')
        );
        visitorId = Number(vRes.lastInsertRowid);
      }
    }

    // Upsert vehicle master record
    let vehicleId: number | null = null;
    const vehicleNumber = String(body.vehicle_number || '').trim().toUpperCase();
    if (vehicleNumber) {
      const existingVeh = db.prepare('SELECT id FROM vehicles WHERE upper(vehicle_number) = ?').get(vehicleNumber) as { id: number } | undefined;
      if (existingVeh) {
        vehicleId = existingVeh.id;
      } else {
        const vhRes = db.prepare(`
          INSERT INTO vehicles (vehicle_number, vehicle_type, vehicle_company, driver_name, driver_cnic)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          vehicleNumber,
          String(body.vehicle_type || 'Sedan'),
          String(body.vehicle_company || body.visitor_company_name || ''),
          String(body.driver_name || ''),
          String(body.driver_cnic || '')
        );
        vehicleId = Number(vhRes.lastInsertRowid);
      }
    }

    const requestNumber = generateRequestNumber();
    const nowIso = new Date().toISOString();
    const entryDate = String(body.entry_date || nowIso.slice(0, 10));
    const entryTime = String(body.entry_time || nowIso.slice(11, 16));

    const result = db.prepare(`
      INSERT INTO requests (
        request_number, entry_date, entry_time, requestor_user_id, requestor_name, department, requestor_employee_id,
        visitor_id, visitor_name, visitor_host_user_id, visitor_host_name, visitor_company_name, visitor_designation,
        visitor_contact_number, visitor_email, cnic_number, cnic_expiry_date, cnic_scan_data, visitor_photo_data, visitor_type,
        arrival_date, arrival_time, departure_date, departure_time, purpose_of_visit, meeting_subject,
        number_of_visitors, duration_of_visit, priority_level,
        vehicle_id, vehicle_number, vehicle_type, driver_name, driver_cnic, vehicle_company, vehicle_entry_time, vehicle_exit_time,
        visiting_area, building, floor, specific_office, restricted_area_required, safety_induction_required, ppe_required,
        meal_required, tea_coffee_required, guest_house_required, transportation_required,
        special_instructions, security_remarks, host_remarks, status, client_offline_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `).run(
      requestNumber,
      entryDate,
      entryTime,
      user.id,
      String(body.requestor_name || user.full_name),
      String(body.department || user.department),
      String(body.requestor_employee_id || user.employee_id),
      visitorId,
      String(body.visitor_name || 'Draft Visitor').trim(),
      body.visitor_host_user_id ? Number(body.visitor_host_user_id) : null,
      String(body.visitor_host_name || '').trim(),
      String(body.visitor_company_name || '').trim(),
      String(body.visitor_designation || '').trim(),
      String(body.visitor_contact_number || '').trim(),
      String(body.visitor_email || '').trim(),
      cnic || '00000-0000000-0',
      String(body.cnic_expiry_date || '2030-01-01'),
      body.cnic_scan_data ? String(body.cnic_scan_data) : null,
      body.visitor_photo_data ? String(body.visitor_photo_data) : null,
      String(body.visitor_type || 'Contractor'),
      arrivalDate,
      String(body.arrival_time || '09:00'),
      String(body.departure_date || arrivalDate),
      String(body.departure_time || '17:00'),
      String(body.purpose_of_visit || ''),
      String(body.meeting_subject || ''),
      Math.max(1, Number(body.number_of_visitors || 1)),
      String(body.duration_of_visit || '4 hours'),
      String(body.priority_level || 'Medium'),
      vehicleId,
      vehicleNumber,
      String(body.vehicle_type || ''),
      String(body.driver_name || ''),
      String(body.driver_cnic || ''),
      String(body.vehicle_company || ''),
      String(body.vehicle_entry_time || ''),
      String(body.vehicle_exit_time || ''),
      String(body.visiting_area || 'Main Admin Block'),
      String(body.building || 'Admin Block A'),
      String(body.floor || ''),
      String(body.specific_office || ''),
      body.restricted_area_required ? 1 : 0,
      body.safety_induction_required ? 1 : 0,
      body.ppe_required ? 1 : 0,
      body.meal_required ? 1 : 0,
      body.tea_coffee_required ? 1 : 0,
      body.guest_house_required ? 1 : 0,
      body.transportation_required ? 1 : 0,
      String(body.special_instructions || ''),
      String(body.security_remarks || ''),
      String(body.host_remarks || ''),
      targetStatus,
      body.client_offline_id ? String(body.client_offline_id) : null
    );

    const requestId = Number(result.lastInsertRowid);

    // Save attachments if provided
    if (Array.isArray(body.attachments)) {
      const insertAtt = db.prepare(`
        INSERT INTO attachments (request_id, file_name, file_type, file_size, category, data_url, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const att of body.attachments.slice(0, 5)) {
        if (att?.file_name && att?.data_url) {
          insertAtt.run(
            requestId,
            String(att.file_name).slice(0, 120),
            String(att.file_type || 'application/octet-stream'),
            Number(att.file_size || 0),
            ['CNIC_SCAN', 'VISITOR_PHOTO', 'DOCUMENT'].includes(att.category) ? att.category : 'DOCUMENT',
            String(att.data_url),
            user.id
          );
        }
      }
    }

    if (!isDraft) {
      dispatchLifecycleNotifications({
        requestId,
        requestNumber,
        visitorName: String(body.visitor_name),
        companyName: String(body.visitor_company_name),
        hostUserId: body.visitor_host_user_id ? Number(body.visitor_host_user_id) : null,
        hostName: String(body.visitor_host_name),
        requestorUserId: user.id,
        requestorEmail: user.email,
        visitorEmail: String(body.visitor_email || ''),
        visitorPhone: String(body.visitor_contact_number || ''),
        eventType: 'NEW_REQUEST',
      });
    }

    logAudit({
      user,
      action: isDraft ? 'SAVE_DRAFT_REQUEST' : 'SUBMIT_REQUEST',
      entityType: 'REQUEST',
      entityId: requestNumber,
      details: `${targetStatus} visitor request for ${body.visitor_name} (${body.visitor_company_name})`,
      req,
    });

    const created = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    res.status(201).json({ request: created });
  });

  router.put('/requests/:id', requireAuth, requirePermission('requests:create'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const body = req.body || {};
    const targetStatus = VALID_STATUSES.has(String(body.status)) ? String(body.status) : String(existing.status);
    const isDraft = targetStatus === 'Draft';
    const validationError = validateRequestPayload({ ...existing, ...body }, isDraft);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    db.prepare(`
      UPDATE requests SET
        visitor_name = ?, visitor_host_user_id = ?, visitor_host_name = ?, visitor_company_name = ?,
        visitor_designation = ?, visitor_contact_number = ?, visitor_email = ?,
        cnic_number = ?, cnic_expiry_date = ?, cnic_scan_data = COALESCE(?, cnic_scan_data),
        visitor_photo_data = COALESCE(?, visitor_photo_data), visitor_type = ?,
        arrival_date = ?, arrival_time = ?, departure_date = ?, departure_time = ?,
        purpose_of_visit = ?, meeting_subject = ?, number_of_visitors = ?, duration_of_visit = ?, priority_level = ?,
        vehicle_number = ?, vehicle_type = ?, driver_name = ?, driver_cnic = ?, vehicle_company = ?,
        visiting_area = ?, building = ?, floor = ?, specific_office = ?,
        restricted_area_required = ?, safety_induction_required = ?, ppe_required = ?,
        meal_required = ?, tea_coffee_required = ?, guest_house_required = ?, transportation_required = ?,
        special_instructions = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      String(body.visitor_name ?? existing.visitor_name),
      body.visitor_host_user_id !== undefined ? (body.visitor_host_user_id ? Number(body.visitor_host_user_id) : null) : existing.visitor_host_user_id,
      String(body.visitor_host_name ?? existing.visitor_host_name),
      String(body.visitor_company_name ?? existing.visitor_company_name),
      String(body.visitor_designation ?? existing.visitor_designation),
      String(body.visitor_contact_number ?? existing.visitor_contact_number),
      String(body.visitor_email ?? existing.visitor_email),
      String(body.cnic_number ?? existing.cnic_number),
      String(body.cnic_expiry_date ?? existing.cnic_expiry_date),
      body.cnic_scan_data ?? null,
      body.visitor_photo_data ?? null,
      String(body.visitor_type ?? existing.visitor_type),
      String(body.arrival_date ?? existing.arrival_date),
      String(body.arrival_time ?? existing.arrival_time),
      String(body.departure_date ?? existing.departure_date),
      String(body.departure_time ?? existing.departure_time),
      String(body.purpose_of_visit ?? existing.purpose_of_visit),
      String(body.meeting_subject ?? existing.meeting_subject),
      Math.max(1, Number(body.number_of_visitors ?? existing.number_of_visitors)),
      String(body.duration_of_visit ?? existing.duration_of_visit),
      String(body.priority_level ?? existing.priority_level),
      String(body.vehicle_number ?? existing.vehicle_number).toUpperCase(),
      String(body.vehicle_type ?? existing.vehicle_type),
      String(body.driver_name ?? existing.driver_name),
      String(body.driver_cnic ?? existing.driver_cnic),
      String(body.vehicle_company ?? existing.vehicle_company),
      String(body.visiting_area ?? existing.visiting_area),
      String(body.building ?? existing.building),
      String(body.floor ?? existing.floor),
      String(body.specific_office ?? existing.specific_office),
      body.restricted_area_required !== undefined ? (body.restricted_area_required ? 1 : 0) : existing.restricted_area_required,
      body.safety_induction_required !== undefined ? (body.safety_induction_required ? 1 : 0) : existing.safety_induction_required,
      body.ppe_required !== undefined ? (body.ppe_required ? 1 : 0) : existing.ppe_required,
      body.meal_required !== undefined ? (body.meal_required ? 1 : 0) : existing.meal_required,
      body.tea_coffee_required !== undefined ? (body.tea_coffee_required ? 1 : 0) : existing.tea_coffee_required,
      body.guest_house_required !== undefined ? (body.guest_house_required ? 1 : 0) : existing.guest_house_required,
      body.transportation_required !== undefined ? (body.transportation_required ? 1 : 0) : existing.transportation_required,
      String(body.special_instructions ?? existing.special_instructions),
      targetStatus,
      id
    );

    if (existing.status === 'Draft' && targetStatus === 'Submitted') {
      dispatchLifecycleNotifications({
        requestId: id,
        requestNumber: String(existing.request_number),
        visitorName: String(body.visitor_name ?? existing.visitor_name),
        companyName: String(body.visitor_company_name ?? existing.visitor_company_name),
        hostUserId: Number(body.visitor_host_user_id ?? existing.visitor_host_user_id) || null,
        hostName: String(body.visitor_host_name ?? existing.visitor_host_name),
        requestorUserId: req.user!.id,
        eventType: 'NEW_REQUEST',
      });
    }

    logAudit({
      user: req.user,
      action: 'UPDATE_REQUEST',
      entityType: 'REQUEST',
      entityId: String(existing.request_number),
      details: `Updated request fields (status: ${targetStatus})`,
      req,
    });

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.json({ request: updated });
  });

  // Workflow status transitions
  router.post('/requests/:id/status', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { status, security_remarks, host_remarks } = req.body || {};
    const user = req.user!;

    if (!VALID_STATUSES.has(String(status))) {
      res.status(400).json({ error: 'Invalid workflow status.' });
      return;
    }

    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: 'Visitor request not found.' });
      return;
    }

    const securityActions = new Set(['Under Review', 'Approved', 'Rejected', 'Visitor Arrived', 'Closed']);
    if (securityActions.has(status) && !user.permissions.includes('requests:approve') && !user.permissions.includes('gate:checkin')) {
      res.status(403).json({ error: 'Security Officer or Administrator permission required for this transition.' });
      return;
    }

    const passCode = status === 'Approved' && !row.pass_code ? generatePassCode() : (row.pass_code as string | null);

    db.prepare(`
      UPDATE requests SET
        status = ?,
        security_remarks = COALESCE(NULLIF(?, ''), security_remarks),
        host_remarks = COALESCE(NULLIF(?, ''), host_remarks),
        reviewed_by = CASE WHEN ? IN ('Under Review', 'Approved', 'Rejected') THEN ? ELSE reviewed_by END,
        reviewed_at = CASE WHEN ? IN ('Under Review', 'Approved', 'Rejected') THEN datetime('now') ELSE reviewed_at END,
        approved_by = CASE WHEN ? = 'Approved' THEN ? ELSE approved_by END,
        approved_at = CASE WHEN ? = 'Approved' THEN datetime('now') ELSE approved_at END,
        pass_code = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      status,
      security_remarks ?? '',
      host_remarks ?? '',
      status,
      user.id,
      status,
      status,
      user.id,
      status,
      passCode,
      id
    );

    if (status === 'Approved') {
      dispatchLifecycleNotifications({
        requestId: id,
        requestNumber: String(row.request_number),
        visitorName: String(row.visitor_name),
        companyName: String(row.visitor_company_name),
        hostUserId: row.visitor_host_user_id ? Number(row.visitor_host_user_id) : null,
        hostName: String(row.visitor_host_name),
        requestorUserId: row.requestor_user_id ? Number(row.requestor_user_id) : null,
        visitorEmail: String(row.visitor_email || ''),
        visitorPhone: String(row.visitor_contact_number || ''),
        eventType: 'REQUEST_APPROVED',
      });
    } else if (status === 'Rejected') {
      dispatchLifecycleNotifications({
        requestId: id,
        requestNumber: String(row.request_number),
        visitorName: String(row.visitor_name),
        companyName: String(row.visitor_company_name),
        hostUserId: row.visitor_host_user_id ? Number(row.visitor_host_user_id) : null,
        hostName: String(row.visitor_host_name),
        requestorUserId: row.requestor_user_id ? Number(row.requestor_user_id) : null,
        visitorEmail: String(row.visitor_email || ''),
        eventType: 'REQUEST_REJECTED',
        extraMessage: security_remarks ? `Remarks: ${security_remarks}` : '',
      });
    } else if (status === 'Visitor Arrived') {
      dispatchLifecycleNotifications({
        requestId: id,
        requestNumber: String(row.request_number),
        visitorName: String(row.visitor_name),
        companyName: String(row.visitor_company_name),
        hostUserId: row.visitor_host_user_id ? Number(row.visitor_host_user_id) : null,
        hostName: String(row.visitor_host_name),
        eventType: 'VISITOR_ARRIVED_GATE',
      });
    }

    logAudit({
      user,
      action: `STATUS_${String(status).toUpperCase().replace(/\s+/g, '_')}`,
      entityType: 'REQUEST',
      entityId: String(row.request_number),
      details: `Transitioned from ${row.status} to ${status}. ${security_remarks || host_remarks || ''}`.trim(),
      req,
    });

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.json({ request: updated });
  });

  // Bulk actions
  router.post('/requests/bulk-action', requireAuth, requirePermission('requests:approve'), (req: AuthedRequest, res: Response) => {
    const { ids, action, remarks } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Select at least one request.' });
      return;
    }
    const targetMap: Record<string, string> = {
      approve: 'Approved',
      reject: 'Rejected',
      close: 'Closed',
      under_review: 'Under Review',
    };
    const nextStatus = targetMap[String(action)];
    if (!nextStatus) {
      res.status(400).json({ error: 'Unsupported bulk action.' });
      return;
    }

    let processed = 0;
    const tx = db.transaction(() => {
      for (const rawId of ids) {
        const id = Number(rawId);
        const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) continue;
        const passCode = nextStatus === 'Approved' && !row.pass_code ? generatePassCode() : (row.pass_code as string | null);
        db.prepare(`
          UPDATE requests SET
            status = ?,
            security_remarks = COALESCE(NULLIF(?, ''), security_remarks),
            approved_by = CASE WHEN ? = 'Approved' THEN ? ELSE approved_by END,
            approved_at = CASE WHEN ? = 'Approved' THEN datetime('now') ELSE approved_at END,
            pass_code = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(nextStatus, remarks || '', nextStatus, req.user!.id, nextStatus, passCode, id);
        processed++;
      }
    });
    tx();

    logAudit({
      user: req.user,
      action: `BULK_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
      entityType: 'REQUEST',
      entityId: ids.join(','),
      details: `Bulk updated ${processed} request(s) to ${nextStatus}`,
      req,
    });

    res.json({ ok: true, processed });
  });

  // ---------------- GATE CHECK-IN / CHECK-OUT ----------------
  router.post('/checkin/:requestId', requireAuth, requirePermission('gate:checkin'), (req: AuthedRequest, res: Response) => {
    const requestId = Number(req.params.requestId);
    const body = req.body || {};
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as Record<string, unknown> | undefined;
    if (!requestRow) {
      res.status(404).json({ error: 'Visitor request not found.' });
      return;
    }

    if (!body.cnic_verified) {
      res.status(400).json({ error: 'Physical CNIC verification checkbox is mandatory before check-in.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const passToken = String(requestRow.pass_code || generatePassCode());
    const barcodeVal = String(requestRow.request_number).replace(/[^A-Z0-9]/g, '').slice(-10);
    const badgeNo = `GATE-${String(requestId).padStart(4, '0')}`;
    const vehicleEntryTime = requestRow.vehicle_number ? (String(body.vehicle_entry_time || nowIso.slice(11, 16))) : '';

    const existing = db.prepare('SELECT id FROM checkin_checkout WHERE request_id = ?').get(requestId) as { id: number } | undefined;
    if (existing) {
      db.prepare(`
        UPDATE checkin_checkout SET
          cnic_verified = 1, captured_photo = COALESCE(?, captured_photo),
          digital_signature = COALESCE(?, digital_signature),
          checked_in_by = ?, check_in_time = ?, vehicle_entry_time = ?,
          badge_printed = ?, gate_notes = ?, updated_at = datetime('now')
        WHERE request_id = ?
      `).run(
        body.captured_photo || null,
        body.digital_signature || null,
        req.user!.id,
        nowIso,
        vehicleEntryTime,
        body.badge_printed ? 1 : 0,
        String(body.gate_notes || ''),
        requestId
      );
    } else {
      db.prepare(`
        INSERT INTO checkin_checkout (
          request_id, visitor_id, cnic_verified, qr_code_token, barcode_value, badge_number,
          badge_printed, captured_photo, digital_signature, checked_in_by, check_in_time, vehicle_entry_time, gate_notes
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        requestId,
        requestRow.visitor_id || null,
        passToken,
        barcodeVal,
        badgeNo,
        body.badge_printed ? 1 : 0,
        body.captured_photo || null,
        body.digital_signature || null,
        req.user!.id,
        nowIso,
        vehicleEntryTime,
        String(body.gate_notes || '')
      );
    }

    db.prepare(`
      UPDATE requests SET
        status = 'Checked In',
        pass_code = COALESCE(pass_code, ?),
        vehicle_entry_time = COALESCE(NULLIF(?, ''), vehicle_entry_time),
        security_remarks = COALESCE(NULLIF(?, ''), security_remarks),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(passToken, vehicleEntryTime, String(body.gate_notes || ''), requestId);

    if (requestRow.visitor_id) {
      db.prepare('UPDATE visitors SET total_visits = total_visits + 1, updated_at = datetime(\'now\') WHERE id = ?').run(requestRow.visitor_id);
    }

    dispatchLifecycleNotifications({
      requestId,
      requestNumber: String(requestRow.request_number),
      visitorName: String(requestRow.visitor_name),
      companyName: String(requestRow.visitor_company_name),
      hostUserId: requestRow.visitor_host_user_id ? Number(requestRow.visitor_host_user_id) : null,
      hostName: String(requestRow.visitor_host_name),
      requestorUserId: requestRow.requestor_user_id ? Number(requestRow.requestor_user_id) : null,
      eventType: 'VISITOR_CHECKED_IN',
    });

    logAudit({
      user: req.user,
      action: 'CHECK_IN_VISITOR',
      entityType: 'CHECKIN',
      entityId: String(requestRow.request_number),
      details: `CNIC ${requestRow.cnic_number} verified. Issued badge ${badgeNo}.`,
      req,
    });

    const checkinRecord = db.prepare('SELECT * FROM checkin_checkout WHERE request_id = ?').get(requestId);
    res.json({ ok: true, checkin: checkinRecord });
  });

  router.post('/checkin/:requestId/print', requireAuth, requirePermission('gate:print_pass'), (req: AuthedRequest, res: Response) => {
    const requestId = Number(req.params.requestId);
    db.prepare("UPDATE checkin_checkout SET badge_printed = 1, updated_at = datetime('now') WHERE request_id = ?").run(requestId);
    logAudit({
      user: req.user,
      action: 'PRINT_VISITOR_PASS',
      entityType: 'CHECKIN',
      entityId: String(requestId),
      details: 'Printed visitor gate badge',
      req,
    });
    res.json({ ok: true });
  });

  router.post('/checkin/:requestId/host-confirm', requireAuth, (req: AuthedRequest, res: Response) => {
    const requestId = Number(req.params.requestId);
    const { type, host_remarks } = req.body || {};
    const user = req.user!;

    if (!user.permissions.includes('host:confirm') && !user.permissions.includes('gate:checkin')) {
      res.status(403).json({ error: 'Host Employee or Security permission required.' });
      return;
    }

    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as Record<string, unknown> | undefined;
    if (!requestRow) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    let checkin = db.prepare('SELECT * FROM checkin_checkout WHERE request_id = ?').get(requestId);
    if (!checkin) {
      const passToken = String(requestRow.pass_code || generatePassCode());
      db.prepare(`
        INSERT INTO checkin_checkout (request_id, visitor_id, cnic_verified, qr_code_token, barcode_value, badge_number)
        VALUES (?, ?, 1, ?, ?, ?)
      `).run(
        requestId,
        requestRow.visitor_id || null,
        passToken,
        String(requestRow.request_number).replace(/[^A-Z0-9]/g, '').slice(-10),
        `GATE-${String(requestId).padStart(4, '0')}`
      );
    }

    if (type === 'arrival') {
      db.prepare(`
        UPDATE checkin_checkout SET
          host_arrival_confirmed = 1, host_arrival_confirmed_at = ?, host_arrival_confirmed_by = ?, updated_at = datetime('now')
        WHERE request_id = ?
      `).run(nowIso, user.id, requestId);

      if (['Checked In', 'Visitor Arrived', 'Approved'].includes(String(requestRow.status))) {
        db.prepare(`
          UPDATE requests SET status = 'In Meeting', host_remarks = COALESCE(NULLIF(?, ''), host_remarks), updated_at = datetime('now')
          WHERE id = ?
        `).run(String(host_remarks || ''), requestId);
      }
    } else {
      db.prepare(`
        UPDATE checkin_checkout SET
          host_departure_confirmed = 1, host_departure_confirmed_at = ?, host_departure_confirmed_by = ?, updated_at = datetime('now')
        WHERE request_id = ?
      `).run(nowIso, user.id, requestId);

      db.prepare(`
        UPDATE requests SET host_remarks = COALESCE(NULLIF(?, ''), host_remarks), updated_at = datetime('now')
        WHERE id = ?
      `).run(String(host_remarks || ''), requestId);
    }

    logAudit({
      user,
      action: type === 'arrival' ? 'HOST_CONFIRM_ARRIVAL' : 'HOST_CONFIRM_DEPARTURE',
      entityType: 'REQUEST',
      entityId: String(requestRow.request_number),
      details: String(host_remarks || `Host confirmed ${type}`),
      req,
    });

    res.json({ ok: true });
  });

  router.post('/checkout/:requestId', requireAuth, requirePermission('gate:checkout'), (req: AuthedRequest, res: Response) => {
    const requestId = Number(req.params.requestId);
    const body = req.body || {};
    const requestRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as Record<string, unknown> | undefined;
    if (!requestRow) {
      res.status(404).json({ error: 'Visitor request not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const vehicleExitTime = requestRow.vehicle_number ? (String(body.vehicle_exit_time || nowIso.slice(11, 16))) : '';
    const nextStatus = body.close_record ? 'Closed' : 'Checked Out';

    db.prepare(`
      UPDATE checkin_checkout SET
        checked_out_by = ?, check_out_time = ?, vehicle_exit_time = ?,
        gate_notes = COALESCE(NULLIF(?, ''), gate_notes), updated_at = datetime('now')
      WHERE request_id = ?
    `).run(req.user!.id, nowIso, vehicleExitTime, String(body.gate_notes || ''), requestId);

    db.prepare(`
      UPDATE requests SET
        status = ?, vehicle_exit_time = COALESCE(NULLIF(?, ''), vehicle_exit_time), updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, vehicleExitTime, requestId);

    dispatchLifecycleNotifications({
      requestId,
      requestNumber: String(requestRow.request_number),
      visitorName: String(requestRow.visitor_name),
      companyName: String(requestRow.visitor_company_name),
      hostUserId: requestRow.visitor_host_user_id ? Number(requestRow.visitor_host_user_id) : null,
      hostName: String(requestRow.visitor_host_name),
      requestorUserId: requestRow.requestor_user_id ? Number(requestRow.requestor_user_id) : null,
      eventType: 'VISITOR_DEPARTED',
    });

    logAudit({
      user: req.user,
      action: 'CHECK_OUT_VISITOR',
      entityType: 'CHECKIN',
      entityId: String(requestRow.request_number),
      details: `Visitor checked out (${nextStatus}).`,
      req,
    });

    res.json({ ok: true, status: nextStatus });
  });

  // ---------------- NOTIFICATIONS ----------------
  router.get('/notifications', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const localRows = db.prepare(`
      SELECT * FROM notifications
      WHERE channel = 'LOCAL' AND (user_id = ? OR target_role = ? OR ? = 'SECURITY_ADMIN')
      ORDER BY created_at DESC, id DESC
      LIMIT 40
    `).all(user.id, user.role_code, user.role_code);

    const outboxRows = ['SECURITY_ADMIN', 'SECURITY_OFFICER'].includes(user.role_code)
      ? db.prepare(`
          SELECT * FROM notifications
          WHERE channel IN ('EMAIL', 'SMS')
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        `).all()
      : [];

    res.json({ notifications: localRows, outbox: outboxRows });
  });

  router.post('/notifications/:id/read', requireAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR target_role = ?').run(user.id, user.role_code);
    res.json({ ok: true });
  });

  // ---------------- ANALYTICS & DASHBOARD ----------------
  router.get('/analytics', requireAuth, (_req: AuthedRequest, res: Response) => {
    const today = new Date().toISOString().slice(0, 10);

    const todaysVisitors = (db.prepare("SELECT COALESCE(SUM(number_of_visitors), 0) as c FROM requests WHERE arrival_date = ? AND status NOT IN ('Draft', 'Rejected')").get(today) as { c: number }).c;
    const insidePlant = (db.prepare("SELECT COALESCE(SUM(number_of_visitors), 0) as c FROM requests WHERE status IN ('Checked In', 'In Meeting')").get() as { c: number }).c;
    const approvedRequests = (db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'Approved'").get() as { c: number }).c;
    const pendingRequests = (db.prepare("SELECT COUNT(*) as c FROM requests WHERE status IN ('Submitted', 'Under Review')").get() as { c: number }).c;
    const rejectedRequests = (db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'Rejected'").get() as { c: number }).c;
    const expiredApprovals = (db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'Approved' AND departure_date < ?").get(today) as { c: number }).c;

    const monthlyTrends = db.prepare(`
      SELECT substr(arrival_date, 1, 7) as month,
             COUNT(*) as total_requests,
             COALESCE(SUM(number_of_visitors), 0) as total_visitors
      FROM requests
      WHERE status != 'Draft'
      GROUP BY substr(arrival_date, 1, 7)
      ORDER BY month ASC
      LIMIT 12
    `).all();

    const categoryStats = db.prepare(`
      SELECT visitor_type as category, COUNT(*) as count
      FROM requests
      WHERE status != 'Draft'
      GROUP BY visitor_type
      ORDER BY count DESC
    `).all();

    const companyWiseVisits = db.prepare(`
      SELECT visitor_company_name as company, COUNT(*) as visits, COALESCE(SUM(number_of_visitors), 0) as heads
      FROM requests
      WHERE status != 'Draft' AND visitor_company_name != ''
      GROUP BY visitor_company_name
      ORDER BY visits DESC
      LIMIT 8
    `).all();

    const departmentWiseVisits = db.prepare(`
      SELECT department, COUNT(*) as visits
      FROM requests
      WHERE status != 'Draft'
      GROUP BY department
      ORDER BY visits DESC
      LIMIT 8
    `).all();

    const frequentVisitors = db.prepare(`
      SELECT full_name, cnic_number, company_name, visitor_type, total_visits
      FROM visitors
      ORDER BY total_visits DESC
      LIMIT 6
    `).all();

    const highSecurityVisitors = db.prepare(`
      SELECT id, request_number, visitor_name, visitor_company_name, cnic_number, priority_level, visiting_area, status, arrival_date
      FROM requests
      WHERE restricted_area_required = 1 OR priority_level IN ('High', 'Emergency')
      ORDER BY created_at DESC
      LIMIT 8
    `).all();

    res.json({
      securityMetrics: {
        todaysVisitors,
        insidePlant,
        approvedRequests,
        pendingRequests,
        rejectedRequests,
        expiredApprovals,
      },
      managementMetrics: {
        monthlyTrends,
        categoryStats,
        companyWiseVisits,
        departmentWiseVisits,
        frequentVisitors,
        highSecurityVisitors,
      },
    });
  });

  // ---------------- OFFLINE QUEUE SYNC ----------------
  router.post('/sync', requireAuth, (req: AuthedRequest, res: Response) => {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Sync items array required.' });
      return;
    }

    const results: { offlineId: string; ok: boolean; error?: string }[] = [];
    for (const item of items) {
      try {
        if (item.type === 'HOST_CONFIRM' && item.requestId) {
          const nowIso = new Date().toISOString();
          const field = item.confirmType === 'arrival' ? 'host_arrival_confirmed' : 'host_departure_confirmed';
          const timeField = item.confirmType === 'arrival' ? 'host_arrival_confirmed_at' : 'host_departure_confirmed_at';
          db.prepare(`UPDATE checkin_checkout SET ${field} = 1, ${timeField} = ? WHERE request_id = ?`).run(nowIso, Number(item.requestId));
          results.push({ offlineId: item.offlineId, ok: true });
        } else {
          results.push({ offlineId: item.offlineId, ok: true });
        }
      } catch (err) {
        results.push({ offlineId: item.offlineId, ok: false, error: (err as Error).message });
      }
    }

    res.json({ synced: results });
  });

  // ---------------- ADMIN: USERS & ROLES ----------------
  router.get('/roles', requireAuth, (_req: AuthedRequest, res: Response) => {
    const roles = db.prepare('SELECT id, code, name, access_level, description FROM roles ORDER BY id ASC').all();
    res.json({ roles });
  });

  router.get('/users', requireAuth, requirePermission('admin:users'), (_req: AuthedRequest, res: Response) => {
    const users = db.prepare(`
      SELECT u.id, u.employee_id, u.username, u.full_name, u.email, u.department, u.phone,
             u.role_id, r.code as role_code, r.name as role_name, r.access_level,
             u.is_active, u.failed_login_attempts, u.locked_until, u.last_login_at, u.last_login_ip, u.created_at
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ORDER BY u.id ASC
    `).all();
    res.json({ users });
  });

  router.post('/users', requireAuth, requirePermission('admin:users'), (req: AuthedRequest, res: Response) => {
    const { employee_id, username, full_name, email, department, phone, role_id, password } = req.body || {};
    if (!employee_id || !username || !full_name || !email || !department || !role_id || !password) {
      res.status(400).json({ error: 'All user fields including password are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    try {
      const { hash, salt } = hashPassword(String(password));
      const result = db.prepare(`
        INSERT INTO users (employee_id, username, full_name, email, department, phone, role_id, password_hash, password_salt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(employee_id).trim(),
        String(username).trim().toLowerCase(),
        String(full_name).trim(),
        String(email).trim(),
        String(department).trim(),
        String(phone || ''),
        Number(role_id),
        hash,
        salt
      );
      logAudit({
        user: req.user,
        action: 'CREATE_USER',
        entityType: 'USER',
        entityId: String(result.lastInsertRowid),
        details: `Created user ${username} (${employee_id})`,
        req,
      });
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) {
      res.status(409).json({ error: `Unable to create user: ${(err as Error).message}` });
    }
  });

  router.put('/users/:id', requireAuth, requirePermission('admin:users'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { full_name, email, department, phone, role_id, is_active, password } = req.body || {};
    db.prepare(`
      UPDATE users SET
        full_name = COALESCE(?, full_name),
        email = COALESCE(?, email),
        department = COALESCE(?, department),
        phone = COALESCE(?, phone),
        role_id = COALESCE(?, role_id),
        is_active = COALESCE(?, is_active),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      full_name ?? null,
      email ?? null,
      department ?? null,
      phone ?? null,
      role_id ? Number(role_id) : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id
    );

    if (password && String(password).length >= 6) {
      const { hash, salt } = hashPassword(String(password));
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id);
    }

    logAudit({
      user: req.user,
      action: 'UPDATE_USER',
      entityType: 'USER',
      entityId: String(id),
      details: `Updated user account #${id}`,
      req,
    });
    res.json({ ok: true });
  });

  router.post('/users/:id/unlock', requireAuth, requirePermission('admin:users'), (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
    logAudit({
      user: req.user,
      action: 'UNLOCK_USER',
      entityType: 'USER',
      entityId: String(id),
      details: `Unlocked user account #${id}`,
      req,
    });
    res.json({ ok: true });
  });

  // ---------------- ADMIN: AUDIT & LOGIN HISTORY ----------------
  router.get('/audit-logs', requireAuth, requirePermission('admin:audit'), (_req: AuthedRequest, res: Response) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all();
    res.json({ logs });
  });

  router.get('/login-history', requireAuth, requirePermission('admin:audit'), (_req: AuthedRequest, res: Response) => {
    const history = db.prepare('SELECT * FROM login_history ORDER BY id DESC LIMIT 150').all();
    res.json({ history });
  });

  // ---------------- ADMIN: CONFIG ----------------
  router.get('/config', requireAuth, (_req: AuthedRequest, res: Response) => {
    const configs = db.prepare('SELECT * FROM system_config ORDER BY key ASC').all();
    res.json({ configs });
  });

  router.put('/config', requireAuth, requirePermission('admin:config'), (req: AuthedRequest, res: Response) => {
    const { updates } = req.body || {};
    if (!Array.isArray(updates)) {
      res.status(400).json({ error: 'updates array required.' });
      return;
    }
    const stmt = db.prepare("UPDATE system_config SET value = ?, updated_at = datetime('now'), updated_by = ? WHERE key = ?");
    for (const item of updates) {
      if (item.key) stmt.run(String(item.value ?? ''), req.user!.username, String(item.key));
    }
    logAudit({
      user: req.user,
      action: 'UPDATE_CONFIG',
      entityType: 'SYSTEM_CONFIG',
      entityId: 'GLOBAL',
      details: `Updated ${updates.length} system configuration values`,
      req,
    });
    res.json({ ok: true });
  });

  // ---------------- ADMIN: BACKUP & RESTORE ----------------
  router.get('/backup/list', requireAuth, requirePermission('admin:backup'), (_req: AuthedRequest, res: Response) => {
    const { backupDir } = getDbPaths();
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = fs.statSync(path.join(backupDir, f));
        return { fileName: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ backups: files });
  });

  router.post('/backup/create', requireAuth, requirePermission('admin:backup'), async (req: AuthedRequest, res: Response) => {
    const info = await createDatabaseBackup('manual');
    logAudit({
      user: req.user,
      action: 'CREATE_BACKUP',
      entityType: 'DATABASE',
      entityId: info.fileName,
      details: `Created SQLite hot backup (${info.sizeBytes} bytes)`,
      req,
    });
    res.json({ backup: info });
  });

  router.get('/backup/download/:fileName', requireAuth, requirePermission('admin:backup'), (req: AuthedRequest, res: Response) => {
    const { backupDir } = getDbPaths();
    const safeName = path.basename(String(req.params.fileName));
    const fullPath = path.join(backupDir, safeName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Backup file not found.' });
      return;
    }
    res.download(fullPath, safeName);
  });

  router.get('/backup/export-json', requireAuth, requirePermission('admin:backup'), (req: AuthedRequest, res: Response) => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      system_config: db.prepare('SELECT * FROM system_config').all(),
      visitors: db.prepare('SELECT * FROM visitors').all(),
      vehicles: db.prepare('SELECT * FROM vehicles').all(),
      requests: db.prepare('SELECT * FROM requests').all(),
      checkin_checkout: db.prepare('SELECT * FROM checkin_checkout').all(),
      notifications: db.prepare('SELECT * FROM notifications').all(),
    };
    logAudit({
      user: req.user,
      action: 'EXPORT_JSON_BACKUP',
      entityType: 'DATABASE',
      entityId: 'SNAPSHOT',
      details: 'Exported full JSON backup snapshot',
      req,
    });
    res.json(snapshot);
  });

  router.post('/backup/restore-json', requireAuth, requirePermission('admin:backup'), async (req: AuthedRequest, res: Response) => {
    const data = req.body;
    if (!data || !Array.isArray(data.requests) || !Array.isArray(data.visitors)) {
      res.status(400).json({ error: 'Invalid backup snapshot format.' });
      return;
    }

    // Create safety pre-restore snapshot first
    await createDatabaseBackup('pre-restore');

    const tx = db.transaction(() => {
      for (const v of data.visitors) {
        db.prepare(`
          INSERT OR IGNORE INTO visitors (id, full_name, cnic_number, cnic_expiry_date, company_name, designation, contact_number, email, visitor_type, total_visits)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(v.id, v.full_name, v.cnic_number, v.cnic_expiry_date, v.company_name, v.designation || '', v.contact_number, v.email || '', v.visitor_type, v.total_visits || 0);
      }
      for (const r of data.requests) {
        db.prepare(`
          INSERT OR IGNORE INTO requests (
            id, request_number, entry_date, entry_time, requestor_name, department, requestor_employee_id,
            visitor_name, visitor_host_name, visitor_company_name, visitor_contact_number, cnic_number, cnic_expiry_date,
            visitor_type, arrival_date, arrival_time, departure_date, departure_time, purpose_of_visit, meeting_subject,
            number_of_visitors, duration_of_visit, priority_level, visiting_area, building, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          r.id, r.request_number, r.entry_date, r.entry_time, r.requestor_name, r.department, r.requestor_employee_id,
          r.visitor_name, r.visitor_host_name, r.visitor_company_name, r.visitor_contact_number, r.cnic_number, r.cnic_expiry_date,
          r.visitor_type, r.arrival_date, r.arrival_time, r.departure_date, r.departure_time, r.purpose_of_visit, r.meeting_subject,
          r.number_of_visitors || 1, r.duration_of_visit || '2 hours', r.priority_level || 'Medium', r.visiting_area, r.building, r.status || 'Submitted'
        );
      }
    });
    tx();

    logAudit({
      user: req.user,
      action: 'RESTORE_BACKUP',
      entityType: 'DATABASE',
      entityId: 'JSON_RESTORE',
      details: `Restored snapshot (${data.requests.length} requests, ${data.visitors.length} visitors)`,
      req,
    });

    res.json({ ok: true, restoredRequests: data.requests.length });
  });

  return router;
}
