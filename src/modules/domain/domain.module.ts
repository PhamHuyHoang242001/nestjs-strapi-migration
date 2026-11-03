import { Module } from '@nestjs/common';
import { DomainController } from './domain.controller';
import { DomainService } from './domain.service';

@Module({ controllers: [DomainController], providers: [DomainService], exports: [DomainService] })
export class DomainModule {}
