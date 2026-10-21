import { describe, expect, it } from 'bun:test';
import { CheckoutTicketService } from './checkout-ticket.service';

describe('CheckoutTicketService (Bounded Domain Ticket Tests)', () => {
  const service = new CheckoutTicketService();
  const staffId = '550e8400-e29b-41d4-a716-446655440000';
  const attendanceId = '660e8400-e29b-41d4-a716-446655440001';

  it('issues a cryptographically valid HMAC ticket with 180s expiration', () => {
    const result = service.issueTicket(staffId, attendanceId, 180);
    expect(result.ticket).toBeDefined();
    expect(typeof result.ticket).toBe('string');
    expect(result.ticket.includes('.')).toBe(true);

    const expiresAtDate = new Date(result.expiresAt);
    expect(expiresAtDate.getTime()).toBeGreaterThan(Date.now() + 175 * 1000);
    expect(expiresAtDate.getTime()).toBeLessThanOrEqual(Date.now() + 185 * 1000);
  });

  it('successfully verifies a freshly issued ticket matching staff & attendance ID', () => {
    const { ticket } = service.issueTicket(staffId, attendanceId, 180);
    const verification = service.verifyTicket(ticket, staffId, attendanceId);

    expect(verification.isValid).toBe(true);
    expect(verification.isExpired).toBe(false);
    expect(verification.payload?.staffId).toBe(staffId);
    expect(verification.payload?.attendanceId).toBe(attendanceId);
  });

  it('rejects a ticket if staffId does not match (anti-tamper / anti-impersonation)', () => {
    const { ticket } = service.issueTicket(staffId, attendanceId, 180);
    const wrongStaffId = '770e8400-e29b-41d4-a716-446655440099';
    const verification = service.verifyTicket(ticket, wrongStaffId, attendanceId);

    expect(verification.isValid).toBe(false);
    expect(verification.isExpired).toBe(false);
  });

  it('rejects a ticket if attendanceId does not match', () => {
    const { ticket } = service.issueTicket(staffId, attendanceId, 180);
    const wrongAttendanceId = '880e8400-e29b-41d4-a716-446655440099';
    const verification = service.verifyTicket(ticket, staffId, wrongAttendanceId);

    expect(verification.isValid).toBe(false);
    expect(verification.isExpired).toBe(false);
  });

  it('rejects a ticket if payload was tampered with (invalid HMAC signature)', () => {
    const { ticket } = service.issueTicket(staffId, attendanceId, 180);
    const parts = ticket.split('.');
    // Actually tamper with base64 payload bytes
    const tamperedPayload = 'tampered' + parts[0].substring(8);
    const tamperedTicket = `${tamperedPayload}.${parts[1]}`;

    const verification = service.verifyTicket(tamperedTicket, staffId, attendanceId);
    expect(verification.isValid).toBe(false);
  });

  it('rejects an expired ticket when ttl has passed (absolute server-authoritative)', () => {
    // Issue ticket with -1 second TTL (already expired in past)
    const { ticket } = service.issueTicket(staffId, attendanceId, -1);
    const verification = service.verifyTicket(ticket, staffId, attendanceId);

    expect(verification.isValid).toBe(false);
    expect(verification.isExpired).toBe(true);
  });
});
