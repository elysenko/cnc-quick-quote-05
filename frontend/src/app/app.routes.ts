import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards';

/**
 * Every navigable state is URL-addressable and deep-linkable, including wizard
 * steps and modal state (carried in query params), so any screen can be
 * bookmarked, shared or linked to directly.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'quotes' },

  {
    path: 'login',
    canActivate: [guestGuard],
    data: { flow: 'auth-login' },
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    data: { flow: 'auth-signup' },
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },

  {
    path: 'quotes',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: { flow: 'quotes-list' },
        loadComponent: () => import('./features/quote/quote-list.component').then((m) => m.QuoteListComponent),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/quote/new-quote-shell.component').then((m) => m.NewQuoteShellComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'upload' },
          {
            path: 'upload',
            data: { flow: 'quote-upload' },
            loadComponent: () => import('./features/quote/upload-step.component').then((m) => m.UploadStepComponent),
          },
          {
            path: 'bends',
            data: { flow: 'quote-bends' },
            loadComponent: () => import('./features/quote/bends-step.component').then((m) => m.BendsStepComponent),
          },
          {
            path: 'material',
            data: { flow: 'quote-material' },
            loadComponent: () =>
              import('./features/quote/material-step.component').then((m) => m.MaterialStepComponent),
          },
          {
            path: 'result',
            data: { flow: 'quote-result' },
            loadComponent: () => import('./features/quote/result-step.component').then((m) => m.ResultStepComponent),
          },
        ],
      },
      {
        path: ':id',
        data: { flow: 'quote-detail' },
        loadComponent: () => import('./features/quote/quote-detail.component').then((m) => m.QuoteDetailComponent),
      },
    ],
  },

  {
    path: 'checkout/:quoteId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/checkout/checkout-shell.component').then((m) => m.CheckoutShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'review' },
      {
        path: 'review',
        data: { flow: 'checkout-review' },
        loadComponent: () => import('./features/checkout/review-step.component').then((m) => m.ReviewStepComponent),
      },
      {
        path: 'shipping',
        data: { flow: 'checkout-shipping' },
        loadComponent: () => import('./features/checkout/shipping-step.component').then((m) => m.ShippingStepComponent),
      },
      {
        path: 'payment',
        data: { flow: 'checkout-payment' },
        loadComponent: () =>
          import('./features/checkout/payment-return.component').then((m) => m.PaymentReturnComponent),
      },
    ],
  },

  {
    path: 'orders',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: { flow: 'orders-list' },
        loadComponent: () => import('./features/orders/order-list.component').then((m) => m.OrderListComponent),
      },
      {
        path: ':id/confirmation',
        data: { flow: 'order-confirmation' },
        loadComponent: () =>
          import('./features/orders/order-confirmation.component').then((m) => m.OrderConfirmationComponent),
      },
      {
        path: ':id',
        data: { flow: 'order-detail' },
        loadComponent: () => import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent),
      },
    ],
  },

  {
    path: 'account',
    canActivate: [authGuard],
    data: { flow: 'account' },
    loadComponent: () => import('./features/account/account.component').then((m) => m.AccountComponent),
  },

  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'materials' },
      {
        path: 'materials',
        data: { flow: 'admin-materials' },
        loadComponent: () => import('./features/admin/materials.component').then((m) => m.MaterialsComponent),
      },
      {
        path: 'pricing',
        data: { flow: 'admin-pricing' },
        loadComponent: () => import('./features/admin/pricing.component').then((m) => m.PricingComponent),
      },
      {
        path: 'machine',
        data: { flow: 'admin-machine' },
        loadComponent: () => import('./features/admin/machine.component').then((m) => m.MachineComponent),
      },
      {
        path: 'business',
        loadComponent: () =>
          import('./features/admin/business-shell.component').then((m) => m.BusinessShellComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'branding' },
          {
            path: 'branding',
            data: { flow: 'admin-business-branding' },
            loadComponent: () => import('./features/admin/branding.component').then((m) => m.BrandingComponent),
          },
          {
            path: 'contact',
            data: { flow: 'admin-business-contact' },
            loadComponent: () => import('./features/admin/contact.component').then((m) => m.ContactComponent),
          },
          {
            path: 'payments',
            data: { flow: 'admin-business-payments' },
            loadComponent: () => import('./features/admin/payments.component').then((m) => m.PaymentsComponent),
          },
          {
            path: 'shipping',
            data: { flow: 'admin-business-shipping' },
            loadComponent: () =>
              import('./features/admin/shipping-methods.component').then((m) => m.ShippingMethodsComponent),
          },
        ],
      },
      {
        path: 'settings',
        data: { flow: 'admin-settings' },
        loadComponent: () => import('./features/admin/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'orders',
        data: { flow: 'admin-orders' },
        loadComponent: () => import('./features/admin/admin-orders.component').then((m) => m.AdminOrdersComponent),
      },
    ],
  },

  {
    path: 'forbidden',
    data: { flow: 'forbidden' },
    loadComponent: () => import('./shared/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  {
    path: '**',
    data: { flow: 'not-found' },
    loadComponent: () => import('./shared/not-found.component').then((m) => m.NotFoundComponent),
  },
];
