import { PartialType } from '@nestjs/swagger';
import { CreateDiagnosticReportDto } from './create-diagnostic-report.dto';

// Body for PATCH /admin/diagnostic/report/:id — all fields optional
export class UpdateDiagnosticReportDto extends PartialType(CreateDiagnosticReportDto) {}
