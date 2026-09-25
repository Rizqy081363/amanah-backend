import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AvatarStoragePort,
  AvatarStorageStream,
  StoredAvatarMetadata,
} from '../ports/avatar-storage.port';

@Injectable()
export class LocalAvatarStorageAdapter implements AvatarStoragePort {
  private readonly logger = new Logger(LocalAvatarStorageAdapter.name);
  private readonly storageRoot: string;

  constructor() {
    const rawRoot = process.env.STORAGE_ROOT || 'data/uploads';
    this.storageRoot = path.isAbsolute(rawRoot)
      ? path.normalize(rawRoot)
      : path.resolve(process.cwd(), rawRoot);

    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
    this.logger.log(`LocalAvatarStorage initialized at: ${this.storageRoot}`);
  }

  private resolveSafePath(storageKey: string): string {
    const normalizedKey = path
      .normalize(storageKey)
      .replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(this.storageRoot, normalizedKey);

    if (!absolutePath.startsWith(this.storageRoot)) {
      throw new Error(
        `Security Exception: Path traversal attempt detected for key: ${storageKey}`,
      );
    }
    return absolutePath;
  }

  public async saveAvatar(
    userId: string,
    buffer: Buffer,
    mimeType: string = 'image/webp',
  ): Promise<StoredAvatarMetadata> {
    const relativeKey = path.join('avatars', userId, 'avatar.webp');
    const finalPath = this.resolveSafePath(relativeKey);
    const parentDir = path.dirname(finalPath);

    if (!fs.existsSync(parentDir)) {
      await fs.promises.mkdir(parentDir, { recursive: true });
    }

    // Atomic write pattern: write to temporary file first, then atomically rename
    const tempPath = `${finalPath}.tmp-${randomUUID()}`;
    await fs.promises.writeFile(tempPath, buffer);
    await fs.promises.rename(tempPath, finalPath);

    const stat = await fs.promises.stat(finalPath);
    return {
      storageKey: relativeKey.replace(/\\/g, '/'),
      byteSize: stat.size,
      mimeType,
    };
  }

  public async getAvatarStream(
    storageKey: string,
  ): Promise<AvatarStorageStream | null> {
    try {
      const filePath = this.resolveSafePath(storageKey);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        return null;
      }

      return {
        stream: fs.createReadStream(filePath),
        mimeType: 'image/webp',
        byteSize: stat.size,
        mtime: stat.mtime,
      };
    } catch (err) {
      this.logger.error(
        `Failed to get avatar stream for key ${storageKey}`,
        err,
      );
      return null;
    }
  }

  public async deleteAvatar(storageKey: string): Promise<void> {
    try {
      const filePath = this.resolveSafePath(storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to unlink obsolete avatar at ${storageKey}:`,
        err,
      );
    }
  }

  public async exists(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.resolveSafePath(storageKey);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }
}
