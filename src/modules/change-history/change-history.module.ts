import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeHistory } from '@modules/databases/change-history.entity';
import { ChangeHistoryController } from './change-history.controller';
import { ChangeHistoryService } from './change-history.service';
import { ChangeHistoryLogger } from './change-history-logger.service';
import { ChangeHistoryRepository } from './repository/change-history.repository';
import { AdminRepository } from '@modules/admins/repository/admin.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ChangeHistory])],
  controllers: [ChangeHistoryController],
  providers: [ChangeHistoryService, ChangeHistoryLogger, ChangeHistoryRepository, AdminRepository],
  exports: [ChangeHistoryLogger, ChangeHistoryRepository],
})
export class ChangeHistoryModule {}
