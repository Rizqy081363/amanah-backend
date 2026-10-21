import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../common/rabbitmq/rabbitmq.module';
import { RedisModule } from '../../common/redis/redis.module';
import { ExportQueueWorker } from './application/export-queue.worker';
import { ExportRunnerService } from './application/export-runner.service';
import { ExportsService } from './application/exports.service';
import { CsvExporter } from './infrastructure/exporters/csv.exporter';
import { ExporterRegistry } from './infrastructure/exporters/exporter.registry';
import { PdfExporter } from './infrastructure/exporters/pdf.exporter';
import { XlsxExporter } from './infrastructure/exporters/xlsx.exporter';
import { AttendanceExportSource } from './infrastructure/sources/attendance.source';
import { PayrollExportSource } from './infrastructure/sources/payroll.source';
import { ExportSourceRegistry } from './infrastructure/sources/source.registry';
import { ExportStorageService } from './infrastructure/storage/export-storage.service';
import { ExportsController } from './presentation/exports.controller';

@Module({
  imports: [RabbitMQModule, RedisModule],
  controllers: [ExportsController],
  providers: [
    ExportsService,
    ExportRunnerService,
    ExportQueueWorker,
    ExportStorageService,
    ExporterRegistry,
    ExportSourceRegistry,
    CsvExporter,
    XlsxExporter,
    PdfExporter,
    AttendanceExportSource,
    PayrollExportSource,
  ],
  exports: [ExportsService, ExportRunnerService],
})
export class ExportsModule {}
