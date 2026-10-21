import * as fs from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { files } from '../../../../database/schema/amanah.schema';

@Injectable()
export class ExportStorageService {
  private readonly logger = new Logger(ExportStorageService.name);
  private readonly exportsDir = path.resolve(process.cwd(), 'files', 'exports');

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {
    if (!fs.existsSync(this.exportsDir)) {
      fs.mkdirSync(this.exportsDir, { recursive: true });
    }
  }

  getSink(jobId: string, extension: string): { filePath: string; sink: fs.WriteStream; storageKey: string } {
    const filename = `${jobId}.${extension}`;
    const filePath = path.join(this.exportsDir, filename);
    const storageKey = `exports/${filename}`;
    const sink = fs.createWriteStream(filePath);
    return { filePath, sink, storageKey };
  }

  async recordFile(input: {
    storageKey: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
    uploadedBy: string;
  }): Promise<string> {
    const [file] = await this.db
      .insert(files)
      .values({
        storageKey: input.storageKey,
        originalName: input.originalName,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        accessScope: 'staff_only',
        uploadedBy: input.uploadedBy,
      })
      .returning({ id: files.id });

    return file.id;
  }

  async getFileMetadata(fileId: string) {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    if (!file) return null;

    const fullPath = path.resolve(process.cwd(), 'files', file.storageKey);
    return {
      ...file,
      fullPath,
      exists: fs.existsSync(fullPath),
    };
  }
}
