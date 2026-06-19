import { config } from '../config';
import { PingResult } from '../types';

export async function pingSystem(systemId: string): Promise<PingResult> {
  const base = config.gatewayBaseUrl.replace(/\/$/, '');
  const url = `${base}/api/admin/systems/${encodeURIComponent(systemId)}/ping`;
  const response = await fetch(url, {
    headers: { 'X-Gateway-Username': config.gatewayAdminUsername },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`Gateway returned HTTP ${response.status}`);
  }
  return response.json() as Promise<PingResult>;
}
