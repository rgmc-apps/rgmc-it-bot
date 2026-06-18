import dotenv from 'dotenv';
dotenv.config();

function get(key: string): string {
  const val = process.env[key];
  if (!val) console.error(`[config] Missing env var: ${key}`);
  return val || '';
}

export const config = {
  port: parseInt(process.env.PORT || '3978', 10),

  botId: get('BOT_ID'),
  botPassword: get('BOT_PASSWORD'),
  tenantId: process.env.TENANT_ID || '',

  supabaseUrl: get('SUPABASE_URL'),
  supabaseKey: get('SUPABASE_SERVICE_KEY'),

  webhookApiKey: get('WEBHOOK_API_KEY'),

  gatewayBaseUrl: process.env.GATEWAY_BASE_URL || '',
  botBaseUrl: process.env.BOT_BASE_URL || '',
};
