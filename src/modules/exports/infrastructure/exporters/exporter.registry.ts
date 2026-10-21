import { Injectable, NotFoundException } from '@nestjs/common';
import { ExportFormat } from '../../domain/export-job.entity';
import { Exporter } from '../../domain/exporter.interface';
import { CsvExporter } from './csv.exporter';
import { PdfExporter } from './pdf.exporter';
import { XlsxExporter } from './xlsx.exporter';

@Injectable()
export class ExporterRegistry {
  private readonly exporters = new Map<ExportFormat, Exporter>();

  constructor(
    private readonly csvExporter: CsvExporter,
    private readonly xlsxExporter: XlsxExporter,
    private readonly pdfExporter: PdfExporter,
  ) {
    this.exporters.set('csv', this.csvExporter);
    this.exporters.set('xlsx', this.xlsxExporter);
    this.exporters.set('pdf', this.pdfExporter);
  }

  get(format: string): Exporter {
    const exporter = this.exporters.get(format.toLowerCase() as ExportFormat);
    if (!exporter) {
      throw new NotFoundException(
        `Exporter format '${format}' is not supported. Supported formats: ${Array.from(this.exporters.keys()).join(', ')}`,
      );
    }
    return exporter;
  }
}
