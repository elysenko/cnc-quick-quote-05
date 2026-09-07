import { ApplicationConfig } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withRouterConfig,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Child steps of `/checkout/:quoteId` and `/quotes/new` must see their parent's
      // route params, otherwise `quoteId` binds as empty and every onward navigation
      // from a wizard step resolves to a broken URL.
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    // The interceptor attaches the in-memory access token and performs a
    // single-flight refresh when the API answers 401.
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
};
