import { Injectable } from '@nestjs/common';
import { AttendanceMethod } from '../constants/attendance.constants';
import {
  InvalidManualCodeException,
  InvalidQrTokenException,
} from '../errors/attendance-domain.errors';
import { AttendanceRepository } from '../repositories/attendance.repository';
import { CheckoutTicketService } from './checkout-ticket.service';

export interface VerifiedCredentialResult {
  qrSessionId: string | null;
  shift?: string;
  proximityVerified: boolean;
}

/**
 * Pure domain service for parsing and verifying attendance entry credentials
 * (Dynamic Terminal QR Tokens, Manual 6-Digit PINs, and Bounded Checkout Tickets).
 * Eliminates duplicate token extraction and validation logic across attendance flows.
 */
@Injectable()
export class AttendanceCredentialValidator {
  constructor(
    private readonly ticketService: CheckoutTicketService,
  ) {}

  /**
   * Sanitizes and parses raw token string, handling potential JSON wrapping.
   */
  parseRawToken(rawToken: string): string {
    const trimmed = rawToken.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.token === 'string') {
          return parsed.token.trim();
        }
      } catch {
        // Fallback to raw trimmed string
      }
    }
    return trimmed;
  }

  /**
   * Verifies proximity proof from terminal QR Code or 6-digit Manual PIN.
   */
  async verifyProximityToken(
    repo: AttendanceRepository,
    token: string,
    method?: AttendanceMethod,
  ): Promise<VerifiedCredentialResult> {
    const cleanToken = this.parseRawToken(token);
    const qrSession = await repo.findQrSessionByToken(cleanToken);
    if (!qrSession) {
      if (method === 'manual_pin') {
        throw new InvalidManualCodeException();
      }
      throw new InvalidQrTokenException();
    }
    return {
      qrSessionId: qrSession.id,
      shift: qrSession.shift,
      proximityVerified: true,
    };
  }

  /**
   * Verifies time-bounded checkout ticket (180s validity window).
   */
  verifyCheckoutTicket(
    ticket: string,
    staffId: string,
    targetRecordId: string,
  ): VerifiedCredentialResult {
    const ticketCheck = this.ticketService.verifyTicket(
      ticket,
      staffId,
      targetRecordId,
    );
    if (ticketCheck.isExpired) {
      throw new InvalidQrTokenException(
        'Tiket presensi pulang kedaluwarsa (melebihi 3 menit). Silakan scan ulang QR code di terminal klinik.',
      );
    }
    if (!ticketCheck.isValid) {
      throw new InvalidQrTokenException('Tiket presensi pulang tidak valid.');
    }
    return {
      qrSessionId: null,
      proximityVerified: true,
    };
  }
}
