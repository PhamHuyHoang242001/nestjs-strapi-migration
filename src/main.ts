import { TransformInterceptor } from '@common/interceptors';
import { initConfigSystem, validation_Errors_Translate } from '@common/utils';
import { CONFIG } from '@configuration/config.provider';
import { BASE_URL, NODE_ENV, PORT, REDIS_HOST, REDIS_PORT, SWAGGER_BASE_URL } from '@configuration/env.config';
import { customOptions, swaggerConfig } from '@configuration/swagger.config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Config } from 'config';
import * as path from 'path';
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters';
import i18n from './service/i18n';
import * as bodyParser from 'body-parser';
import { NODE_ENVIRONMENT } from './constant';
// import { SessionModule } from '@nestjs/session';
/**
 * process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
 * process.env.TZ = 'UTC-7';
 */

async function initializeApp(app: INestApplication) {
  app.enableCors({
    origin: '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'device'],
    methods: 'GET,PUT,POST,DELETE,UPDATE,OPTIONS,PATCH',
  });

  app.setGlobalPrefix(BASE_URL);
  // app.useGlobalFilters(new AllExceptionsFilter());
  // Interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: validation_Errors_Translate,
      transform: true,
      whitelist: true,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
}

async function initializeMicroservice(app: INestApplication) {
  try {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.REDIS,
      options: {
        host: REDIS_HOST,
        port: REDIS_PORT,
      },
    });

    await app.startAllMicroservices();
  } catch (error) {
    console.warn(`[Microservice] Redis microservice failed to start (non-fatal): ${error?.message}`);
  }
}
async function initializeSwagger(app: INestApplication) {
  // Swagger
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_BASE_URL, app, swaggerDocument, customOptions);
}

async function bootstrap() {
  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
  const appOptions = {
    cors: true,
    bufferLogs: true,
  };

  const app = await NestFactory.create<NestExpressApplication>(AppModule, appOptions);

  app.get<Config>(CONFIG);

  await initializeApp(app);

  // serve static files from /public so uploaded files are accessible
  (app as NestExpressApplication).useStaticAssets(path.join(__dirname, '..', 'public'));

  await initializeMicroservice(app);

  if (NODE_ENV === NODE_ENVIRONMENT.DEV) {
    initializeSwagger(app);
  }
  i18n.configure({
    locales: ['en', 'vi'],
    defaultLocale: 'en',
    directory: path.join(__dirname, '../i18n'),
    updateFiles: false,
    // autoReload: true,
    // syncFiles: true,
  });
  /**
   *   Logger
   *   app.useLogger(app.get(Logger));
   */

  await app.listen(PORT);
  initConfigSystem();
  try {
    // do something
  } catch (error) {
    console.error(`Failed to initialize, due to ${error}`);
    process.exit(1);
  }
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
