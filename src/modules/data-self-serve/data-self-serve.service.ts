import {
  DataSelfServeRequestGroup,
  DataSelfServeRequestStatus,
  DataSelfServeStorageType,
  DataSelfServeUploadMethod,
  DataSelfServeValidationStatus,
} from '@common/enums';
import { standardizePagination } from '@common/utils';
import { DataSelfServeIndustry } from '@modules/databases/data-self-serve-industry.entity';
import { DataSelfServeRequest } from '@modules/databases/data-self-serve-request.entity';
import { DataSelfServeSegment } from '@modules/databases/data-self-serve-segment.entity';
import { DataSelfServeValidationLog } from '@modules/databases/data-self-serve-validation-log.entity';
import { MaToolBranchConfig } from '@modules/databases/ma-tool-branch-config.entity';
import { MaToolDataServiceCenter } from '@modules/databases/ma-tool-data-service-center.entity';
import { Users } from '@modules/databases/user.entity';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { Repository } from 'typeorm';
import { DATA_SELF_SERVE_EVENTS } from './data-self-serve.events';
import { DATA_SELF_SERVE_SORT_MAP, formatRequest } from './data-self-serve-format.helper';
import {
  CreateDataSelfServeRequestDto,
  SearchDataSelfServeRequestDto,
  SubmitDataSelfServeRequestDto,
  UpdateDataSelfServeRequestDto,
  ValidateDataSelfServeFileDto,
} from './dto/data-self-serve.dto';
import {
  assertManualScopeType,
  assertUploadScopeType,
  buildScope,
  emptyUploadScope,
} from './data-self-serve-scope.helper';
import { DataSelfServeQuotaService } from './data-self-serve-quota.service';
import { buildInputBackupPath, buildRequestCode, buildRequestParams } from './data-self-serve-request.helper';

const DEFAULT_STATUSES = [
  DataSelfServeRequestStatus.FAILED,
  DataSelfServeRequestStatus.PROCESSING,
  DataSelfServeRequestStatus.SUCCESSFULLY,
];

@Injectable()
export class DataSelfServeService {
  constructor(
    @InjectRepository(DataSelfServeRequest) private readonly requestRepo: Repository<DataSelfServeRequest>,
    @InjectRepository(DataSelfServeValidationLog) private readonly logRepo: Repository<DataSelfServeValidationLog>,
    @InjectRepository(MaToolBranchConfig) private readonly branchRepo: Repository<MaToolBranchConfig>,
    @InjectRepository(DataSelfServeSegment) private readonly segmentRepo: Repository<DataSelfServeSegment>,
    @InjectRepository(DataSelfServeIndustry) private readonly industryRepo: Repository<DataSelfServeIndustry>,
    @InjectRepository(MaToolDataServiceCenter) private readonly centerRepo: Repository<MaToolDataServiceCenter>,
    @InjectRepository(Users) private readonly userRepo: Repository<Users>,
    private readonly quotaService: DataSelfServeQuotaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findRequest(query: SearchDataSelfServeRequestDto, userId: number) {
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 10), 100);
    const qb = this.requestRepo.createQueryBuilder('req').where('req.created_by_user_id = :userId', { userId });
    qb.andWhere('req.request_status IN (:...statuses)', {
      statuses: query.requestStatus ? [query.requestStatus] : DEFAULT_STATUSES,
    });
    if (query.requestGroup) qb.andWhere('req.request_group = :requestGroup', { requestGroup: query.requestGroup });
    if (query.inputMethod) qb.andWhere('req.input_method = :inputMethod', { inputMethod: query.inputMethod });
    if (query.startCreatedAt)
      qb.andWhere('req.created_at >= :startCreatedAt', { startCreatedAt: query.startCreatedAt });
    if (query.endCreatedAt) qb.andWhere('req.created_at <= :endCreatedAt', { endCreatedAt: query.endCreatedAt });
    if (query.keyword?.trim()) qb.andWhere('req.code ILIKE :keyword', { keyword: `%${query.keyword.trim()}%` });
    const sortCol = DATA_SELF_SERVE_SORT_MAP[query.sortField || 'createdAt'] || 'created_at';
    const sortDir = query.sortValue?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`req.${sortCol}`, sortDir)
      .skip((page - 1) * limit)
      .take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return { data: rows.map(formatRequest), meta: standardizePagination(total, rows.length, limit, page) };
  }

  async findOneRequest(id: number, userId: number) {
    const request = await this.requestRepo.findOne({ where: { id }, relations: ['validation_logs'] });
    this.assertOwned(request, userId);
    const [user, module] = await Promise.all([
      this.userRepo.findOne({ where: { id: request.created_by_user_id }, select: ['id', 'username', 'email'] }),
      this.centerRepo.findOne({ where: { module_code: request.request_group as unknown as string } }),
    ]);
    return { data: { ...request, created_by_user: user, module_name: module?.module_name || module?.name } };
  }

  async getRequestStats(query: SearchDataSelfServeRequestDto, userId: number) {
    const qb = this.requestRepo.createQueryBuilder('req').where('req.created_by_user_id = :userId', { userId });
    qb.andWhere('req.request_status IN (:...statuses)', {
      statuses: query.requestStatus ? [query.requestStatus] : DEFAULT_STATUSES,
    });
    if (query.requestGroup) qb.andWhere('req.request_group = :requestGroup', { requestGroup: query.requestGroup });
    if (query.inputMethod) qb.andWhere('req.input_method = :inputMethod', { inputMethod: query.inputMethod });
    if (query.keyword?.trim()) qb.andWhere('req.code ILIKE :keyword', { keyword: `%${query.keyword.trim()}%` });
    const rows = await qb
      .select('req.request_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('req.request_status')
      .getRawMany();
    const stats = { total: 0, processing: 0, successfully: 0, failed: 0 };
    rows.forEach((row) => {
      stats[row.status] = Number(row.count);
      stats.total += Number(row.count);
    });
    return { data: stats };
  }

  async getRequestConfig() {
    const [branchs, segments, industries] = await Promise.all([
      this.branchRepo.find({ select: ['id', 'branch_code', 'branch_name'] }),
      this.segmentRepo.find({ select: ['id', 'seg_code'] }),
      this.industryRepo.find({ select: ['id', 'industry_code'] }),
    ]);
    return {
      data: {
        bookCodes: branchs,
        segments: segments.map((item) => ({ id: item.id, code: item.seg_code })),
        industries: industries.map((item) => ({ id: item.id, code: item.industry_code })),
      },
    };
  }

  async getRemaining(userId: number, requestGroup = DataSelfServeRequestGroup.EDAPORTAL_TRACUULICHTRANO) {
    return { data: await this.quotaService.getRemaining(userId, requestGroup) };
  }

  async create(body: CreateDataSelfServeRequestDto, user: Record<string, unknown>) {
    assertManualScopeType(body.scopeType);
    await this.quotaService.consume(Number(user.id), body.requestGroup);
    const request = await this.requestRepo.save(
      this.requestRepo.create({
        request_status: DataSelfServeRequestStatus.SUBMITED,
        destination_path: '',
        input_method: DataSelfServeUploadMethod.MANUAL,
        storage_type: DataSelfServeStorageType.S3,
        created_by_user_id: Number(user.id),
        updated_by_user_id: Number(user.id),
        request_group: body.requestGroup,
        short_description: body.scopeValue,
      }),
    );
    request.code = buildRequestCode(request.id);
    request.request_params = buildRequestParams(request, user, buildScope(body.scopeType, [body.scopeValue]), body);
    await this.requestRepo.save(request);
    this.eventEmitter.emit(DATA_SELF_SERVE_EVENTS.PUSH_PAYLOAD_TO_DPC, {
      user,
      requestId: request.id,
      requestGroup: request.request_group,
    });
    return { data: { id: request.id } };
  }

  async validateFileInput(body: ValidateDataSelfServeFileDto, user: Record<string, unknown>) {
    assertUploadScopeType(body.scopeType);
    const ext = path.extname(body.fileUrl.split('?')[0]).toLowerCase();
    if (!['.xlsx', '.xlsm'].includes(ext)) throw new BadRequestException('Invalid file');
    const request = await this.requestRepo.save(
      this.requestRepo.create({
        request_status: DataSelfServeRequestStatus.DRAFT,
        request_group: body.requestGroup,
        destination_path: '',
        input_method: DataSelfServeUploadMethod.UPLOAD,
        validation_status: DataSelfServeValidationStatus.PROCESSING,
        storage_type: DataSelfServeStorageType.S3,
        portal_file_url: body.fileUrl,
        file_size: body.fileSize,
        created_by_user_id: Number(user.id),
        updated_by_user_id: Number(user.id),
        short_description: `${body.fileName}${ext}`,
      }),
    );
    request.code = buildRequestCode(request.id);
    request.backup_input_file_path = buildInputBackupPath(ext, request.id, body.fileName);
    request.request_params = buildRequestParams(request, user, emptyUploadScope(body.scopeType), {
      fromDate: '',
      toDate: '',
    });
    await this.requestRepo.save(request);
    this.eventEmitter.emit(DATA_SELF_SERVE_EVENTS.VALIDATE_FILE_INPUT, {
      user,
      requestId: request.id,
      fileUrl: body.fileUrl,
    });
    return { data: { id: request.id } };
  }

  async submitRequestToDpc(id: number, body: SubmitDataSelfServeRequestDto, user: Record<string, unknown>) {
    const request = await this.requestRepo.findOne({ where: { id } });
    this.assertOwned(request, Number(user.id));
    if (
      request.validation_status !== DataSelfServeValidationStatus.SUCCESSFULLY ||
      request.request_status !== DataSelfServeRequestStatus.DRAFT
    ) {
      throw new BadRequestException('Invalid request state');
    }
    await this.quotaService.consume(Number(user.id), request.request_group);
    request.request_status = DataSelfServeRequestStatus.SUBMITED;
    request.request_params = {
      ...request.request_params,
      payload: {
        ...(request.request_params as any)?.payload,
        date: { from_date: body.fromDate, to_date: body.toDate },
      },
    };
    await this.requestRepo.save(request);
    this.eventEmitter.emit(DATA_SELF_SERVE_EVENTS.PUSH_PAYLOAD_TO_DPC, {
      user,
      requestId: id,
      requestGroup: request.request_group,
    });
    this.eventEmitter.emit(DATA_SELF_SERVE_EVENTS.PUSH_FILE_INPUT_TO_S3, {
      user,
      requestId: id,
      fileSize: request.file_size,
      destinationPath: request.backup_input_file_path,
      fileUrl: request.portal_file_url,
    });
    return { data: { id } };
  }

  async update(id: number, body: UpdateDataSelfServeRequestDto) {
    if (body.status === DataSelfServeRequestStatus.SUCCESSFULLY && !body.destination_path)
      throw new BadRequestException('Invalid data');
    if (![DataSelfServeRequestStatus.FAILED, DataSelfServeRequestStatus.SUCCESSFULLY].includes(body.status))
      throw new BadRequestException('Invalid status');
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.request_status !== DataSelfServeRequestStatus.PROCESSING)
      throw new BadRequestException('Request is not processing');
    Object.assign(request, {
      destination_path: body.destination_path,
      request_completed_at: new Date(),
      request_status: body.status,
      storage_type: body.storage_type,
      source: body.source,
    });
    await this.requestRepo.save(request);
    const user = await this.userRepo.findOne({ where: { id: request.created_by_user_id } });
    this.eventEmitter.emit(DATA_SELF_SERVE_EVENTS.COMPLETED_REQUEST, {
      user,
      requestId: id,
      requestStatus: body.status,
      requestCode: request.code,
    });
    return { data: { id } };
  }

  getOutputFileInfo(id: number, userId: number) {
    return this.getDownloadInfo(id, userId, 'destination_path');
  }

  getInputFileInfo(id: number, userId: number) {
    return this.getDownloadInfo(id, userId, 'backup_input_file_path');
  }

  private async getDownloadInfo(id: number, userId: number, field: 'destination_path' | 'backup_input_file_path') {
    const request = await this.requestRepo.findOne({ where: { id } });
    this.assertOwned(request, userId);
    if (!request[field]) throw new BadRequestException('Invalid data');
    return { path: request[field], fileName: request.code || 'downloaded-file' };
  }

  private assertOwned(request: DataSelfServeRequest | null, userId: number): asserts request is DataSelfServeRequest {
    if (!request) throw new NotFoundException('Request not found');
    if (request.created_by_user_id !== userId) throw new ForbiddenException('No permission');
  }
}
