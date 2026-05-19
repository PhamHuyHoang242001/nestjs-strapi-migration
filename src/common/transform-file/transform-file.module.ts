import { DynamicModule, Module, Provider } from '@nestjs/common';
import { TransformFileController } from './transform-file.controller';
import { TransformFileService } from './transform-file.service';

@Module({})
export class TransformFileModule {
  static register(options: { imports?: any[]; resolvers: Provider[] }): DynamicModule {
    return {
      module: TransformFileModule,
      imports: options.imports || [],
      controllers: [TransformFileController],
      providers: [
        TransformFileService,
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
