import { TurnContext } from 'botbuilder';
import { config } from '../config';

export interface FeatureRequestResult {
  success: boolean;
  message: string;
}

// Posts a feature request to rgmc-gateway, which creates it as a regular
// issue/ticket. Reuses the same shared secret the gateway uses to call this
// bot's own webhooks (IT_BOT_API_KEY on the gateway == WEBHOOK_API_KEY here).
export async function submitFeatureRequest(
  context: TurnContext,
  systemTag: string,
  title: string,
  description: string
): Promise<FeatureRequestResult> {
  if (!config.gatewayBaseUrl || !config.webhookApiKey) {
    return { success: false, message: '❌ Feature request submission is not configured on this bot yet (missing GATEWAY_BASE_URL/WEBHOOK_API_KEY).' };
  }

  const reporterName = context.activity.from?.name?.trim() || 'MS Teams User';

  let res: Response;
  try {
    res = await fetch(`${config.gatewayBaseUrl.replace(/\/$/, '')}/api/webhooks/bot-feature-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.webhookApiKey,
      },
      body: JSON.stringify({
        system_tag: systemTag,
        title,
        description,
        reporter_name: reporterName,
      }),
    });
  } catch (err) {
    console.error('submitFeatureRequest: request failed:', (err as Error).message);
    return { success: false, message: '❌ Could not reach the RGMC Gateway. Please try again later.' };
  }

  const body = await res.json().catch(() => ({} as Record<string, unknown>));

  if (!res.ok) {
    const error = (body as { error?: string })?.error || res.statusText;
    return { success: false, message: `❌ Couldn't create the feature request: ${error}` };
  }

  const ticketNumber = (body as { ticket_number?: string })?.ticket_number;
  return {
    success: true,
    message: ticketNumber
      ? `✅ Feature request submitted as **${ticketNumber}**! The IT team will take it from here.`
      : `✅ Feature request submitted! The IT team will take it from here.`,
  };
}
