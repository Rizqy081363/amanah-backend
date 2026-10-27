import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

interface CheckoutTicketPayload {
  staffId: string;
  attendanceId: string;
  scannedAt: number;
  exp: number;
}

export interface IssuedTicket {
  ticket: string;
  expiresAt: string;
}

export interface TicketVerificationResult {
  isValid: boolean;
  isExpired: boolean;
  payload?: CheckoutTicketPayload;
}

/**
 * Domain service murni untuk mengelola tiket presensi pulang awal (Early Checkout Challenge).
 * Menerapkan batas waktu kedaluwarsa absolut berbasis HMAC-SHA256 server-authoritative
 * untuk mencegah bypassing proximity proof tanpa mengorbankan kenyamanan staf saat mengetik alasan.
 */
@Injectable()
export class CheckoutTicketService {
  private readonly secret: string;

  constructor() {
    this.secret =
      process.env.AUTH_JWT_SECRET ||
      process.env.APP_KEY ||
      'amanah-checkout-ticket-hmac-secret-salt';
  }

  /**
   * Menerbitkan tiket kepulangan bertanda tangan server dengan batas kedaluwarsa absolut (default 180 detik = 3 menit).
   */
  issueTicket(
    staffId: string,
    attendanceId: string,
    ttlSeconds: number = 180,
  ): IssuedTicket {
    const now = Date.now();
    const exp = now + ttlSeconds * 1000;
    const payload: CheckoutTicketPayload = {
      staffId,
      attendanceId,
      scannedAt: now,
      exp,
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(payloadBase64)
      .digest('base64url');

    const ticket = `${payloadBase64}.${signature}`;
    const expiresAt = new Date(exp).toISOString();

    return { ticket, expiresAt };
  }

  /**
   * Memverifikasi keabsahan tiket, kepemilikan staf & attendance ID, serta batas waktu kedaluwarsa absolut server.
   */
  verifyTicket(
    ticket: string,
    expectedStaffId: string,
    expectedAttendanceId: string,
  ): TicketVerificationResult {
    if (!ticket || typeof ticket !== 'string') {
      return { isValid: false, isExpired: false };
    }

    const parts = ticket.split('.');
    if (parts.length !== 2) {
      return { isValid: false, isExpired: false };
    }

    const [payloadBase64, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(payloadBase64)
      .digest('base64url');

    // Mencegah timing attack
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { isValid: false, isExpired: false };
    }

    try {
      const payload: CheckoutTicketPayload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString('utf8'),
      );

      // Verifikasi keterikatan pada entitas presensi & profil staf
      if (
        payload.staffId !== expectedStaffId ||
        payload.attendanceId !== expectedAttendanceId
      ) {
        return { isValid: false, isExpired: false };
      }

      // Verifikasi batas waktu kedaluwarsa absolut server
      const isExpired = Date.now() > payload.exp;
      return {
        isValid: !isExpired,
        isExpired,
        payload,
      };
    } catch {
      return { isValid: false, isExpired: false };
    }
  }
}
