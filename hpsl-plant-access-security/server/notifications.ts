import { db } from './db.ts';

export type NotificationEvent =
  | 'NEW_REQUEST'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'VISITOR_ARRIVED_GATE'
  | 'VISITOR_CHECKED_IN'
  | 'VISITOR_DEPARTED';

interface DispatchInput {
  requestId: number;
  requestNumber: string;
  visitorName: string;
  companyName: string;
  hostUserId?: number | null;
  hostName: string;
  requestorUserId?: number | null;
  requestorEmail?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  eventType: NotificationEvent;
  extraMessage?: string;
}

export function dispatchLifecycleNotifications(input: DispatchInput) {
  const insert = db.prepare(`
    INSERT INTO notifications (
      user_id, target_role, request_id, channel, event_type, title, message, recipient_address, delivery_status, is_read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const hostRow = input.hostUserId
    ? (db.prepare('SELECT id, email, phone FROM users WHERE id = ?').get(input.hostUserId) as
        | { id: number; email: string; phone: string }
        | undefined)
    : undefined;

  const reqRow = input.requestorUserId
    ? (db.prepare('SELECT id, email, phone FROM users WHERE id = ?').get(input.requestorUserId) as
        | { id: number; email: string; phone: string }
        | undefined)
    : undefined;

  const eventTemplates: Record<
    NotificationEvent,
    { title: string; body: string; notifySecurity: boolean; notifyHost: boolean; notifyRequestor: boolean }
  > = {
    NEW_REQUEST: {
      title: `New Visitor Request: ${input.visitorName}`,
      body: `${input.requestNumber} from ${input.companyName} (Host: ${input.hostName}) submitted for security review.`,
      notifySecurity: true,
      notifyHost: true,
      notifyRequestor: false,
    },
    REQUEST_APPROVED: {
      title: `Access Approved: ${input.requestNumber}`,
      body: `Visitor ${input.visitorName} (${input.companyName}) approved for plant access. Gate pass generated.`,
      notifySecurity: false,
      notifyHost: true,
      notifyRequestor: true,
    },
    REQUEST_REJECTED: {
      title: `Access Rejected: ${input.requestNumber}`,
      body: `Visitor request for ${input.visitorName} (${input.companyName}) was rejected. ${input.extraMessage || ''}`.trim(),
      notifySecurity: false,
      notifyHost: true,
      notifyRequestor: true,
    },
    VISITOR_ARRIVED_GATE: {
      title: `Visitor At Gate: ${input.visitorName}`,
      body: `${input.visitorName} (${input.companyName}) has arrived at the gate for ${input.requestNumber}.`,
      notifySecurity: true,
      notifyHost: true,
      notifyRequestor: false,
    },
    VISITOR_CHECKED_IN: {
      title: `Visitor Checked In: ${input.visitorName}`,
      body: `${input.visitorName} (${input.companyName}) cleared CNIC verification and entered the plant (${input.requestNumber}).`,
      notifySecurity: false,
      notifyHost: true,
      notifyRequestor: true,
    },
    VISITOR_DEPARTED: {
      title: `Visitor Checked Out: ${input.visitorName}`,
      body: `${input.visitorName} (${input.companyName}) checked out of the plant. Record ${input.requestNumber} updated.`,
      notifySecurity: false,
      notifyHost: true,
      notifyRequestor: true,
    },
  };

  const tpl = eventTemplates[input.eventType];

  if (tpl.notifySecurity) {
    insert.run(null, 'SECURITY_OFFICER', input.requestId, 'LOCAL', input.eventType, tpl.title, tpl.body, 'gate-security@hpsl-plant.local', 'SENT');
  }
  if (tpl.notifyHost) {
    insert.run(hostRow?.id ?? null, 'HOST_EMPLOYEE', input.requestId, 'LOCAL', input.eventType, tpl.title, tpl.body, hostRow?.email || '', 'SENT');
    if (hostRow?.email) {
      insert.run(hostRow.id, 'HOST_EMPLOYEE', input.requestId, 'EMAIL', input.eventType, tpl.title, tpl.body, hostRow.email, 'QUEUED_OFFLINE');
    }
    if (hostRow?.phone) {
      insert.run(hostRow.id, 'HOST_EMPLOYEE', input.requestId, 'SMS', input.eventType, tpl.title, tpl.body, hostRow.phone, 'PENDING');
    }
  }
  if (tpl.notifyRequestor) {
    insert.run(reqRow?.id ?? null, 'DEPT_REQUESTOR', input.requestId, 'LOCAL', input.eventType, tpl.title, tpl.body, reqRow?.email || '', 'SENT');
    const emailDest = reqRow?.email || input.requestorEmail || '';
    if (emailDest) {
      insert.run(reqRow?.id ?? null, 'DEPT_REQUESTOR', input.requestId, 'EMAIL', input.eventType, tpl.title, tpl.body, emailDest, 'QUEUED_OFFLINE');
    }
  }
  if (input.visitorEmail && (input.eventType === 'REQUEST_APPROVED' || input.eventType === 'REQUEST_REJECTED')) {
    insert.run(null, null, input.requestId, 'EMAIL', input.eventType, tpl.title, tpl.body, input.visitorEmail, 'QUEUED_OFFLINE');
  }
  if (input.visitorPhone && input.eventType === 'REQUEST_APPROVED') {
    insert.run(null, null, input.requestId, 'SMS', input.eventType, tpl.title, tpl.body, input.visitorPhone, 'PENDING');
  }
}
