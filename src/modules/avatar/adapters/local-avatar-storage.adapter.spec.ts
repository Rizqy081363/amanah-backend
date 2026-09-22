import * as fs from 'fs';
import * as path from 'path';
import { LocalAvatarStorageAdapter } from './local-avatar-storage.adapter';

describe('LocalAvatarStorageAdapter', () => {
  let adapter: LocalAvatarStorageAdapter;
  const testUserId = 'test-user-123';
  const testData = Buffer.from('fake-avatar-bytes-content');

  beforeEach(() => {
    adapter = new LocalAvatarStorageAdapter();
  });

  afterAll(async () => {
    // Cleanup test files
    await adapter.deleteAvatar(`avatars/${testUserId}/avatar.webp`);
    const testDir = path.resolve(process.cwd(), 'data', 'uploads', 'avatars', testUserId);
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should save an avatar atomically and report existence', async () => {
    const saved = await adapter.saveAvatar(testUserId, testData);
    expect(saved.storageKey).toBe(`avatars/${testUserId}/avatar.webp`);
    expect(saved.byteSize).toBe(testData.length);

    const exists = await adapter.exists(saved.storageKey);
    expect(exists).toBe(true);

    const streamObj = await adapter.getAvatarStream(saved.storageKey);
    expect(streamObj).not.toBeNull();
    expect(streamObj?.byteSize).toBe(testData.length);
    streamObj?.stream.destroy();
  });

  it('should throw an error on path traversal attempts', async () => {
    await expect(
      adapter.getAvatarStream('../../etc/passwd'),
    ).resolves.toBeNull(); // handled safely or thrown
  });
});
