import { Global, Module } from '@nestjs/common';
import { MinioStorageService } from './minio-s3';
import { ResendEmailService } from './resend-api';
import { StripeService } from './stripe-sdk';

@Global()
@Module({
  providers: [MinioStorageService, ResendEmailService, StripeService],
  exports: [MinioStorageService, ResendEmailService, StripeService],
})
export class IntegrationsModule {}
