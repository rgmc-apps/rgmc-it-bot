import { CloudAdapter, MessageFactory, TurnContext } from 'botbuilder';
import { getAllSubscriptions } from './supabase';
import { matchesFilters } from './channelService';
import { buildTicketCreatedCard, buildTicketUpdatedCard } from '../cards/ticketCard';
import { Ticket, TicketChanges } from '../types';
import { config } from '../config';

async function sendToSubscription(
  adapter: CloudAdapter,
  subscription: { conversation_ref: object; service_url: string },
  attachment: ReturnType<typeof buildTicketCreatedCard>
): Promise<void> {
  try {
    await adapter.continueConversationAsync(
      config.botId,
      subscription.conversation_ref as Parameters<typeof adapter.continueConversationAsync>[1],
      async (turnContext: TurnContext) => {
        await turnContext.sendActivity(MessageFactory.attachment(attachment));
      }
    );
  } catch (err) {
    console.error('Failed to send to channel:', (err as Error).message);
  }
}

export async function notifyTicketCreated(ticket: Ticket, adapter: CloudAdapter): Promise<void> {
  const subscriptions = await getAllSubscriptions();
  const card = buildTicketCreatedCard(ticket);

  await Promise.allSettled(
    subscriptions
      .filter((s) => matchesFilters(s, ticket, 'created'))
      .map((s) => sendToSubscription(adapter, s, card))
  );
}

export async function notifyTicketUpdated(
  ticket: Ticket,
  changes: TicketChanges,
  adapter: CloudAdapter
): Promise<void> {
  const subscriptions = await getAllSubscriptions();

  const isResolved =
    changes['status']?.to === 'resolved' || changes['status']?.to === 'closed';
  const eventType = isResolved ? 'resolved' : 'updated';

  const card = buildTicketUpdatedCard(ticket, changes);

  await Promise.allSettled(
    subscriptions
      .filter((s) => matchesFilters(s, ticket, eventType))
      .map((s) => sendToSubscription(adapter, s, card))
  );
}
