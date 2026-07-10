import { Module } from '@nestjs/common';
import { StepScopeService } from './step-scope.service';

// AuthorizationModule is @Global and exports PermissionCacheService +
// OwnerScopeResolverService, so this module only needs to register/exports
// StepScopeService. Imported by BiPaymentModule so the document (and later
// comment/template/checklist) services can inject it.
@Module({
  providers: [StepScopeService],
  exports: [StepScopeService],
})
export class StepScopeModule {}
