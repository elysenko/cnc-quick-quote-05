/**
 * The credential surface rendered at /admin/settings: one row per provisioned
 * backing service and one per third-party integration this app calls.
 */
export interface SettingDefinition {
  key: string;
  label: string;
  kind: 'service' | 'integration';
  description: string;
}

export const SETTINGS_CATALOG: SettingDefinition[] = [
  {
    key: 'DATABASE_URL',
    label: 'PostgreSQL',
    kind: 'service',
    description: 'Primary datastore for drawings, quotes and orders. Injected by the platform.',
  },
  {
    key: 'MINIO_ENDPOINT',
    label: 'MinIO endpoint',
    kind: 'service',
    description: 'Object storage endpoint holding uploaded DXF files, logos and receipts.',
  },
  {
    key: 'MINIO_S3_MINIO_7_2_20_API_KEY',
    label: 'MinIO / S3',
    kind: 'integration',
    description: 'Access credential for object storage. Format: accessKey:secretKey.',
  },
  {
    key: 'RESEND_API_RESEND_2_43_API_KEY',
    label: 'Resend API',
    kind: 'integration',
    description: 'Sends order-confirmation email. Orders still complete when this is unset.',
  },
  {
    key: 'STRIPE_SDK_PYTHON_STRIPE_15_6_API_KEY',
    label: 'Stripe SDK',
    kind: 'integration',
    description: 'Secret key for hosted Checkout. Overridden by the key set under Business → Payments.',
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    label: 'Stripe webhook secret',
    kind: 'integration',
    description: 'Signing secret used to verify POST /api/webhooks/stripe deliveries.',
  },
];
