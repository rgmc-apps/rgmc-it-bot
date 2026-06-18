import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '3978', 10),

  botId: required('BOT_ID'),
  botPassword: required('BOT_PASSWORD'),
  tenantId: process.env.TENANT_ID || '',

  supabaseUrl: required('SUPABASE_URL'),
  supabaseKey: required('SUPABASE_SERVICE_KEY'),

  webhookApiKey: required('WEBHOOK_API_KEY'),

  gatewayBaseUrl: process.env.GATEWAY_BASE_URL || '',
};
