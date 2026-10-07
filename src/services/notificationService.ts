import { CloudAdapter, MessageFactory, TurnContext } from 'botbuilder';
import { getAllSubscriptions, getUserLinkByUsername } from './supabase';
import { matchesFilters } from './channelService';
import { buildTicketCreatedCard, buildTicketUpdatedCard } from '../cards/ticketCard';
import { buildOutageCard } from '../cards/outageCard';
import { buildMentionCard } from '../cards/mentionCard';
import { buildAssignmentCard } from '../cards/assignmentCard';
import { Ticket, TicketChanges, Outage, MentionPayload, AssignmentPayload } from '../types';
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

export async function notifyMention(payload: MentionPayload, adapter: CloudAdapter): Promise<void> {
  if (payload.mentioned_username.toLowerCase() === payload.by_username.toLowerCase()) return;
  const link = await getUserLinkByUsername(payload.mentioned_username);
  if (!link) return; // not linked to a personal Teams chat — nothing to send
  const card = buildMentionCard(payload);
  await sendToSubscription(adapter, link, card);
}

export async function notifyAssignment(payload: AssignmentPayload, adapter: CloudAdapter): Promise<void> {
  if (payload.assigned_username.toLowerCase() === payload.assigned_by.toLowerCase()) return;
  const link = await getUserLinkByUsername(payload.assigned_username);
  if (!link) return;
  const card = buildAssignmentCard(payload);
  await sendToSubscription(adapter, link, card);
}

export async function notifyOutageDetected(
  outage: Outage,
  issueCount: number,
  adapter: CloudAdapter
): Promise<void> {
  const subscriptions = await getAllSubscriptions();
  const card = buildOutageCard(outage, issueCount);

  // Send to all subscriptions that have outage notifications (notify_created serves as the general flag)
  await Promise.allSettled(
    subscriptions
      .filter((s) => s.notify_created)
      .map((s) => sendToSubscription(adapter, s, card))
  );
}
