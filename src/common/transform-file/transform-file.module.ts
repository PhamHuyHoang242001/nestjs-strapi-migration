import { DynamicModule, Module, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { TransformFileController } from './transform-file.controller';
import { TransformFileAuthGuard } from './transform-file-auth.guard';
import { TransformFileAuthRedirectFilter } from './transform-file-auth-redirect.filter';
import { TransformFileService } from './transform-file.service';

@Module({})
export class TransformFileModule {
  static register(options: { imports?: any[]; resolvers: Provider[] }): DynamicModule {
    return {
      module: TransformFileModule,
      // JwtModule provides JwtService; the guard passes the secret per-verify from
      // ConfigService (global), so no secret needs configuring here.
      imports: [...(options.imports || []), JwtModule.register({})],
      controllers: [TransformFileController],
      providers: [
        TransformFileService,
        AdminRepository,
        TransformFileAuthGuard,
        TransformFileAuthRedirectFilter,
        ...options.resolvers,
        {
          provide: 'TRANSFORM_FILE_RESOLVERS',
          useFactory: (...resolvers: any[]) => resolvers,
          inject: options.resolvers.map((r) => (typeof r === 'function' ? r : (r as any).provide)),
        },
      ],
      exports: [TransformFileService],
    };
  }
}
