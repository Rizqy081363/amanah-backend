import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Readable } from 'stream';
import { NameInitialsHelper } from '../../common/utils/name-initials.helper';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { staffProfiles, user, users } from '../../database/schema';
import { AvatarProcessingService } from './avatar-processing.service';
import { AvatarSvgService } from './avatar-svg.service';
import {
  AVATAR_STORAGE_PORT,
  type AvatarStoragePort,
} from './ports/avatar-storage.port';

export interface AvatarContract {
  url: string;
  initials: string;
  type: 'custom' | 'oauth' | 'initials';
  hasCustomAvatar: boolean;
  directUrl?: string | null;
}

export type AvatarResource =
  | {
      kind: 'stream';
      stream: Readable;
      mimeType: string;
      byteSize: number;
      etag: string;
    }
  | {
      kind: 'redirect';
      url: string;
      statusCode: number;
    }
  | {
      kind: 'svg';
      buffer: Buffer;
      mimeType: string;
      byteSize: number;
      etag: string;
    };

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private readonly processingService: AvatarProcessingService,
    private readonly svgService: AvatarSvgService,
    @Inject(AVATAR_STORAGE_PORT)
    private readonly storagePort: AvatarStoragePort,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Upload and process a new custom avatar for a user:
   * 1. Validates magic bytes & converts to 512x512 WebP (stripping EXIF)
   * 2. Atomically writes to storage
   * 3. Updates users.image_url, user.image (Better Auth), and staff_profiles.avatar_url directly
   */
  async uploadAvatar(
    userId: string,
    rawBuffer: Buffer,
  ): Promise<{ avatarUrl: string; avatar: AvatarContract }> {
    if (!rawBuffer || rawBuffer.length === 0) {
      throw new BadRequestException('Avatar buffer is empty');
    }

    // Verify user exists
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    // Process image buffer (magic-bytes, resize, webp, strip EXIF)
    const processed = await this.processingService.process(rawBuffer);

    // Save to storage atomically
    await this.storagePort.saveAvatar(
      userId,
      processed.buffer,
      processed.mimeType,
    );

    // Canonical avatar URL with version query param to invalidate HTTP/client caches
    const timestamp = Date.now();
    const avatarUrl = `/api/v1/users/${userId}/avatar?v=${timestamp}`;

    // Update canonical users record
    await this.db
      .update(users)
      .set({
        imageUrl: avatarUrl,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    // Update Better Auth user table for parity
    try {
      await this.db
        .update(user)
        .set({
          image: avatarUrl,
          updatedAt: new Date().toISOString() as any,
        })
        .where(eq(user.id, userId));
    } catch (err) {
      this.logger.warn(
        `Failed to update Better Auth user.image parity for ${userId}:`,
        err,
      );
    }

    // Update staff_profiles.avatar_url directly (if staff profile exists for this user)
    try {
      await this.db
        .update(staffProfiles)
        .set({
          avatarUrl: avatarUrl,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(staffProfiles.userId, userId));
    } catch (err) {
      this.logger.warn(
        `Failed to update staff_profiles.avatar_url for user ${userId}:`,
        err,
      );
    }

    const initials = NameInitialsHelper.getInitials(userRecord.name);

    return {
      avatarUrl,
      avatar: {
        url: avatarUrl,
        initials,
        type: 'custom',
        hasCustomAvatar: true,
        directUrl: avatarUrl,
      },
    };
  }

  /**
   * Resolves the avatar resource for public delivery:
   * 1. Checks if a local custom WebP exists -> stream with ETag & Cache-Control
   * 2. Else checks if user has an external OAuth URL -> 307 Temporary Redirect
   * 3. Else generates deterministic SVG fallback with initials
   */
  async getAvatarResource(userId: string): Promise<AvatarResource> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    const storageKey = `avatars/${userId}/avatar.webp`;
    const exists = await this.storagePort.exists(storageKey);

    if (exists) {
      const streamData = await this.storagePort.getAvatarStream(storageKey);
      if (streamData) {
        const mtimeMs = streamData.mtime ? streamData.mtime.getTime() : 0;
        const etag = `W/"${streamData.byteSize}-${mtimeMs}"`;
        return {
          kind: 'stream',
          stream: streamData.stream,
          mimeType: streamData.mimeType,
          byteSize: streamData.byteSize,
          etag,
        };
      }
    }

    // Check if user has an external OAuth image URL (e.g. googleusercontent.com)
    if (
      userRecord.imageUrl &&
      (userRecord.imageUrl.startsWith('http://') ||
        userRecord.imageUrl.startsWith('https://')) &&
      !userRecord.imageUrl.includes(`/api/v1/users/${userId}/avatar`)
    ) {
      return {
        kind: 'redirect',
        url: userRecord.imageUrl,
        statusCode: 307,
      };
    }

    // Generate fallback SVG
    const svg = this.svgService.generateSvg(userRecord.name);
    const buffer = Buffer.from(svg, 'utf-8');
    const safeNameHash = Buffer.from(userRecord.name || '')
      .toString('hex')
      .slice(0, 8);
    const etag = `W/"svg-${userId}-${safeNameHash}"`;

    return {
      kind: 'svg',
      buffer,
      mimeType: 'image/svg+xml; charset=utf-8',
      byteSize: buffer.length,
      etag,
    };
  }

  /**
   * Deletes a custom avatar and reverts the user to initials fallback
   */
  async deleteAvatar(userId: string): Promise<void> {
    const storageKey = `avatars/${userId}/avatar.webp`;
    await this.storagePort.deleteAvatar(storageKey);

    await this.db
      .update(users)
      .set({
        imageUrl: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    try {
      await this.db
        .update(user)
        .set({
          image: null,
          updatedAt: new Date().toISOString() as any,
        })
        .where(eq(user.id, userId));
    } catch {
      // parity update non-blocking
    }

    // Clear staff_profiles.avatar_url directly
    try {
      await this.db
        .update(staffProfiles)
        .set({
          avatarUrl: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(staffProfiles.userId, userId));
    } catch {
      // non-blocking
    }
  }
}
