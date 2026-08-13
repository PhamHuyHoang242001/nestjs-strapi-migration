import { TransformInterceptor } from '@common/interceptors';
import { initConfigSystem, validation_Errors_Translate } from '@common/utils';
import { CONFIG } from '@configuration/config.provider';
import { BASE_URL, CORS_ORIGINS, NODE_ENV, PORT, REDIS_HOST, REDIS_PORT, SWAGGER_BASE_URL } from '@configuration/env.config';
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
import i18n from './service/i18n';
import * as bodyParser from 'body-parser';
import { NODE_ENVIRONMENT } from './constant';

function initializeApp(app: NestExpressApplication): void {
  // Express 5 defaults the query parser to 'simple' (Node querystring), which does NOT understand
  // bracket-array notation: `tags[]=a&tags[]=b` yields a literal key `tags[]`
  // instead of an array under `tags`, so array query params silently drop (whitelist strips
  // the unknown key). Restore the 'extended' (qs) parser so `key[]=...` maps to an array — matching
  // how the frontend (axios default) serializes array params.
  app.set('query parser', 'extended');

  app.enableCors({
    // Reflect the request origin when it is in the allowlist. Required because a `*` wildcard
    // is invalid together with `credentials: true`, which browsers reject for credentialed calls.
    origin: (origin, callback) => {
      // Allow non-browser clients (no Origin header) and any allowlisted browser origin.
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'device'],
    methods: 'GET,PUT,POST,DELETE,UPDATE,OPTIONS,PATCH',
  });

  app.setGlobalPrefix(BASE_URL);
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

async function initializeMicroservice(app: INestApplication): Promise<void> {
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
    const err = error as Error | undefined;
    console.warn(`[Microservice] Redis microservice failed to start (non-fatal): ${err?.message}`);
  }
}

function initializeSwagger(app: INestApplication): void {
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_BASE_URL, app, swaggerDocument, customOptions);
}

async function bootstrap(): Promise<void> {
  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
  const appOptions = {
    cors: true,
    bufferLogs: true,
  };

  const app = await NestFactory.create<NestExpressApplication>(AppModule, appOptions);

  app.get<Config>(CONFIG);

  initializeApp(app);

  // serve static files from /public so uploaded files are accessible
  app.useStaticAssets(path.join(__dirname, '..', 'public'));

  await initializeMicroservice(app);

  if (NODE_ENV === NODE_ENVIRONMENT.DEV) {
    initializeSwagger(app);
  }

  (i18n as unknown as { configure: (opts: Record<string, unknown>) => void }).configure({
    locales: ['en', 'vi'],
    defaultLocale: 'en',
    directory: path.join(__dirname, '../i18n'),
    updateFiles: false,
  });

  await app.listen(PORT);
  initConfigSystem();
  try {
    // do something
  } catch (error) {
    console.error(`Failed to initialize, due to ${String(error)}`);
    process.exit(1);
  }
  console.log(`Application is running on: ${await app.getUrl()}`);
}

void bootstrap();
