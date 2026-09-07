import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
// cookie-parser is CommonJS; a default import compiles but is undefined at runtime
// without esModuleInterop, so it is required through the namespace form.
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn'],
    // Stripe signature verification needs the body byte-for-byte, so Nest keeps
    // the raw buffer alongside the parsed JSON.
    rawBody: true,
  });

  app.use(cookieParser());

  // Behind nginx the client IP arrives in X-Forwarded-For; without this the
  // rate limiter would key every request to the proxy's address.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
      // 422 (not 400) so the Angular error mapper can route validation failures
      // onto form fields distinctly from malformed requests.
      errorHttpStatusCode: 422,
    }),
  );

  // In production the SPA is served by nginx from the same origin and proxied
  // to /api, so CORS is only needed for the `ng serve` development workflow.
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CNC Quick Quote API')
    .setDescription('DXF quoting, nesting, pricing, checkout and administration')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`CNC Quick Quote API listening on :${port}`);
}

void bootstrap();
