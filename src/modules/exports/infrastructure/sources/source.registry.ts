import { Injectable, NotFoundException } from '@nestjs/common';
import { ExportSource } from '../../domain/export-source.interface';
import { AttendanceExportSource } from './attendance.source';
import { PayrollExportSource } from './payroll.source';

@Injectable()
export class ExportSourceRegistry {
  private readonly sources = new Map<string, ExportSource>();

  constructor(
    private readonly attendanceSource: AttendanceExportSource,
    private readonly payrollSource: PayrollExportSource,
  ) {
    this.sources.set('attendance', this.attendanceSource);
    this.sources.set('payroll', this.payrollSource);
  }

  get(type: string): ExportSource {
    const source = this.sources.get(type.toLowerCase());
    if (!source) {
      throw new NotFoundException(
        `Export data source '${type}' is not supported. Supported types: ${Array.from(this.sources.keys()).join(', ')}`,
      );
    }
    return source;
  }
}
