import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DriverMetadata,
  UserBackupDriver,
} from '../../domain/drivers/user-backup-driver.interface';
import { CsvUserBackupDriver } from './csv-user-backup.driver';
import { JsonUserBackupDriver } from './json-user-backup.driver';
import { SqlUserBackupDriver } from './sql-user-backup.driver';

@Injectable()
export class UserBackupDriverRegistry {
  private readonly drivers = new Map<string, UserBackupDriver>();

  constructor(
    jsonDriver: JsonUserBackupDriver,
    csvDriver: CsvUserBackupDriver,
    sqlDriver: SqlUserBackupDriver,
  ) {
    this.register(jsonDriver);
    this.register(csvDriver);
    this.register(sqlDriver);
  }

  register(driver: UserBackupDriver): void {
    this.drivers.set(driver.format.toLowerCase(), driver);
  }

  getDriver(format: string): UserBackupDriver {
    const cleanFormat = format.toLowerCase().trim();
    const driver = this.drivers.get(cleanFormat);
    if (!driver) {
      const supported = Array.from(this.drivers.keys()).join(', ');
      throw new BadRequestException(
        `Format cadangan "${format}" tidak didukung. Format yang didukung: ${supported}.`,
      );
    }
    return driver;
  }

  getSupportedDrivers(): DriverMetadata[] {
    return Array.from(this.drivers.values()).map((d) => ({
      format: d.format,
      displayName: d.displayName,
      extension: d.extension,
      mimeType: d.mimeType,
      supportsRestore: d.supportsRestore,
      description: d.description,
    }));
  }
}
