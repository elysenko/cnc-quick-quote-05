import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AppConfigModule } from './config/config.module';
import { CryptoModule } from './crypto/crypto.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { DrawingsModule } from './drawings/drawings.module';
import { BendsModule } from './bends/bends.module';
import { MaterialsModule } from './materials/materials.module';
import { QuotesModule } from './quotes/quotes.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrdersModule } from './orders/orders.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';
import { AllExceptionsFilter } from './common/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // In-memory store: this app runs single-replica and no Redis is provisioned.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    CryptoModule,
    AppConfigModule,
    IntegrationsModule,
    AuthModule,
    HealthModule,
    DrawingsModule,
    BendsModule,
    MaterialsModule,
    QuotesModule,
    CheckoutModule,
    OrdersModule,
    WebhooksModule,
    AdminModule,
  ],
  providers: [
    // Authentication is on by default; @Public() opts a route out. A new route
    // is therefore protected unless somebody deliberately opens it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
