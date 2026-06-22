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
  gatewayAdminUsername: process.env.GATEWAY_ADMIN_USERNAME || '',
  botBaseUrl: process.env.BOT_BASE_URL || '',

  gptApiKey: get('GPT_API_KEY'),
  gptVersion: process.env.GPT_VERSION || 'gpt-4o',
  gptLimit: parseInt(process.env.GPT_LIMIT || '4096', 10),

  gcpApiUrl: process.env.GCP_API_URL || '',
};
