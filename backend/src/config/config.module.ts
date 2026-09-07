import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { DomainConfigService } from './domain-config.service';

@Global()
@Module({
  providers: [AppConfigService, DomainConfigService],
  exports: [AppConfigService, DomainConfigService],
})
export class AppConfigModule {}
