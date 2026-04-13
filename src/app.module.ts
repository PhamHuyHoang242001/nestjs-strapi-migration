import { configProvider } from '@configuration/config.provider';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import ormConfig from './configuration/orm.config';
import { PermissionModule } from '@modules/permission/permission.module';
import { MulterModule } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';
import { MAX_SIZE_EXCEL, THROTTLE_MESSAGE } from './constant';
import { RoleModule } from './modules/role/role.module';
import { TokenModule } from './modules/token/token.module';
import { UsersModule } from './modules/users/users.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CommonServiceModule } from '@modules/common-service/common-service.module';
import { AuthModule } from '@modules/auth/auth.module';
import * as session from 'express-session';
import * as passport from 'passport';
import * as cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AdminsModule } from '@modules/admins/admins.module';
import { UploadsModule } from '@modules/upload/uploads.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      useFactory() {
        return ormConfig;
      },
      async dataSourceFactory(options) {
        if (!options) {
          throw new Error('Invalid options passed');
        }

        return addTransactionalDataSource(new DataSource(options));
      },
    }),
    MulterModule.register({
      limits: {
        fileSize: MAX_SIZE_EXCEL,
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10000,
        },
      ],
      errorMessage: THROTTLE_MESSAGE,
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    AuthModule,
    TokenModule,
    RoleModule,
    PermissionModule,
    SettingsModule,
    CommonServiceModule,
    AdminsModule,
    UploadsModule,

  ],
  controllers: [AppController],
  providers: [
    AppService,
    configProvider,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const secretKey = randomBytes(32).toString('hex');
    consumer
      .apply(cookieParser(), session({ secret: secretKey, resave: false, saveUninitialized: false }))
      .forRoutes('*');
    // Initialize Passport
    consumer.apply(passport.initialize()).forRoutes('*');
    // Initialize Passport
    consumer.apply(passport.initialize()).forRoutes('*');
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
