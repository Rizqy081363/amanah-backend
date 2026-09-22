import { Readable } from 'stream';

export const AVATAR_STORAGE_PORT = Symbol('AVATAR_STORAGE_PORT');

export interface StoredAvatarMetadata {
  storageKey: string;
  byteSize: number;
  mimeType: string;
}

export interface AvatarStorageStream {
  stream: Readable;
  mimeType: string;
  byteSize: number;
  mtime?: Date;
}

export interface AvatarStoragePort {
  saveAvatar(
    userId: string,
    buffer: Buffer,
    mimeType?: string,
  ): Promise<StoredAvatarMetadata>;

  getAvatarStream(storageKey: string): Promise<AvatarStorageStream | null>;

  deleteAvatar(storageKey: string): Promise<void>;

  exists(storageKey: string): Promise<boolean>;
}
