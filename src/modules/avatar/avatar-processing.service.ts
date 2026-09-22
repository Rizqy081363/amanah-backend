import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';

export interface ProcessedAvatar {
  buffer: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const TARGET_SIZE = 512;
const WEBP_QUALITY = 82;

@Injectable()
export class AvatarProcessingService {
  /**
   * Sniffs magic bytes to ensure file is JPEG, PNG, or WebP.
   */
  private validateMagicBytes(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 12) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true;
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return true;
    }

    // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return true;
    }

    return false;
  }

  /**
   * Processes an incoming raw image buffer:
   * 1. Validates magic bytes (JPEG/PNG/WebP only)
   * 2. Checks size boundaries (<= 5MB)
   * 3. Validates and inspects via sharp
   * 4. Auto-orients EXIF, strips all metadata
   * 5. Crops & resizes to 512x512 cover
   * 6. Encodes to WebP
   */
  async process(rawBuffer: Buffer): Promise<ProcessedAvatar> {
    if (!rawBuffer || rawBuffer.length === 0) {
      throw new UnprocessableEntityException('Avatar buffer is empty');
    }

    if (rawBuffer.length > MAX_AVATAR_BYTES) {
      throw new UnprocessableEntityException(
        `Avatar file size exceeds 5MB limit (received ${(rawBuffer.length / 1024 / 1024).toFixed(2)}MB)`,
      );
    }

    if (!this.validateMagicBytes(rawBuffer)) {
      throw new UnprocessableEntityException(
        'Invalid image file. Only JPEG, PNG, and WebP images are accepted.',
      );
    }

    try {
      const image = sharp(rawBuffer, { failOn: 'error' });
      const metadata = await image.metadata();

      if (
        !metadata.format ||
        !['jpeg', 'png', 'webp'].includes(metadata.format)
      ) {
        throw new UnprocessableEntityException(
          `Unsupported image format: ${metadata.format}. Allowed: JPEG, PNG, WebP.`,
        );
      }

      // Transform: auto-orient, resize 512x512 cover, strip metadata, convert to WebP
      const processedBuffer = await sharp(rawBuffer)
        .rotate() // auto-orient based on EXIF
        .resize(TARGET_SIZE, TARGET_SIZE, {
          fit: 'cover',
          position: 'centre',
        })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer();

      return {
        buffer: processedBuffer,
        mimeType: 'image/webp',
        width: TARGET_SIZE,
        height: TARGET_SIZE,
      };
    } catch (err: unknown) {
      if (err instanceof UnprocessableEntityException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new UnprocessableEntityException(
        `Failed to process avatar image: ${message}`,
      );
    }
  }
}
