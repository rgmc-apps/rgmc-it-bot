import { TurnContext, ConversationReference } from 'botbuilder';
import {
  getRegistrationCode,
  getSubscriptionByChannelId,
  createSubscription,
  subscribeChannelDirect,
  deleteSubscription,
  markCodeUsed,
  updateSubscriptionFilters,
} from './supabase';
import { BotSubscription } from '../types';

export interface RegisterResult {
  success: boolean;
  message: string;
  subscription?: BotSubscription;
}

export async function registerChannel(context: TurnContext, code: string): Promise<RegisterResult> {
  const registrationCode = await getRegistrationCode(code);
  if (!registrationCode) {
    return { success: false, message: `❌ Registration code \`${code}\` is not valid.` };
  }
  if (registrationCode.used) {
    return { success: false, message: `❌ Code \`${code}\` has already been used.` };
  }
  if (registrationCode.expires_at && new Date(registrationCode.expires_at) < new Date()) {
    return { success: false, message: `❌ Code \`${code}\` has expired.` };
  }

  const activity = context.activity;
  const teamsData = activity.channelData as Record<string, unknown> | undefined;

  const channelId: string =
    (teamsData?.['teamsChannelId'] as string) ||
    activity.conversation.id;

  const conversationRef = TurnContext.getConversationReference(activity);
  const teamId = (teamsData?.['team'] as { id?: string } | undefined)?.id || null;
  const channelName = (teamsData?.['channel'] as { name?: string } | undefined)?.name || null;
  const tenantId = (teamsData?.['tenant'] as { id?: string } | undefined)?.id || null;

  const existing = await getSubscriptionByChannelId(channelId);
  if (existing) {
    return {
      success: false,
      message: `ℹ️ This channel is already registered for notifications (code: \`${existing.registration_code}\`). Use \`@RGMC IT Bot unregister\` first to re-register.`,
    };
  }

  const subscription = await createSubscription({
    channelId,
    serviceUrl: activity.serviceUrl,
    conversationRef,
    tenantId,
    teamId,
    channelName,
    registrationCode: code.toUpperCase(),
  });

  if (!subscription) {
    return { success: false, message: '❌ Failed to save subscription. Please try again.' };
  }

  await markCodeUsed(code, channelId);

  return {
    success: true,
    message: `✅ This channel is now registered for RGMC IT ticket notifications!\n\n**Code used:** \`${code.toUpperCase()}\`\n\nYou'll receive alerts when tickets are created, updated, or resolved.\nType \`@RGMC IT Bot help\` to see available commands.`,
    subscription,
  };
}

const VALID_EVENTS = new Set(['created', 'updated', 'resolved', 'all']);

export async function subscribeChannel(
  context: TurnContext,
  events: string[]
): Promise<RegisterResult> {
  const activity = context.activity;
  const teamsData = activity.channelData as Record<string, unknown> | undefined;

  const channelId: string =
    (teamsData?.['teamsChannelId'] as string) ||
    activity.conversation.id;

  const existing = await getSubscriptionByChannelId(channelId);
  if (existing) {
    return {
      success: false,
      message: `ℹ️ This channel is already subscribed for notifications.\n\nUse \`@RGMC IT Bot configure\` to adjust which events you receive, or \`@RGMC IT Bot status\` to see current settings.`,
    };
  }

  const wantsAll     = events.length === 0 || events.includes('all');
  const notifyCreated  = wantsAll || events.includes('created');
  const notifyUpdated  = wantsAll || events.includes('updated');
  const notifyResolved = wantsAll || events.includes('resolved');

  const conversationRef = TurnContext.getConversationReference(activity);
  const teamId      = (teamsData?.['team']   as { id?: string }   | undefined)?.id   || null;
  const channelName = (teamsData?.['channel'] as { name?: string } | undefined)?.name || null;
  const tenantId    = (teamsData?.['tenant']  as { id?: string }   | undefined)?.id   || null;

  const subscription = await subscribeChannelDirect({
    channelId,
    serviceUrl: activity.serviceUrl,
    conversationRef,
    tenantId,
    teamId,
    channelName,
    notifyCreated,
    notifyUpdated,
    notifyResolved,
  });

  if (!subscription) {
    return { success: false, message: '❌ Failed to subscribe. Please try again.' };
  }

  const eventList: string[] = [];
  if (notifyCreated)  eventList.push('🆕 Ticket created');
  if (notifyUpdated)  eventList.push('✏️ Ticket updated');
  if (notifyResolved) eventList.push('✅ Ticket resolved');

  return {
    success: true,
    message: [
      `✅ This channel is now **subscribed** for RGMC IT ticket notifications!`,
      ``,
      `**Events you'll receive:**`,
      ...eventList.map(e => `• ${e}`),
      ``,
      `Use \`@RGMC IT Bot configure\` to fine-tune filters (priority, type).`,
      `Use \`@RGMC IT Bot unregister\` to stop notifications.`,
    ].join('\n'),
    subscription,
  };
}

export async function unregisterChannel(context: TurnContext): Promise<{ success: boolean; message: string }> {
  const activity = context.activity;
  const teamsData = activity.channelData as Record<string, unknown> | undefined;
  const channelId: string =
    (teamsData?.['teamsChannelId'] as string) ||
    activity.conversation.id;

  const existing = await getSubscriptionByChannelId(channelId);
  if (!existing) {
    return { success: false, message: `ℹ️ This channel is not registered for notifications.` };
  }

  const ok = await deleteSubscription(channelId);
  if (!ok) {
    return { success: false, message: '❌ Failed to unregister. Please try again.' };
  }

  return { success: true, message: '✅ This channel has been unregistered from ticket notifications.' };
}

export async function configureFilters(
  context: TurnContext,
  args: string[]
): Promise<{ success: boolean; message: string }> {
  const activity = context.activity;
  const teamsData = activity.channelData as Record<string, unknown> | undefined;
  const channelId: string =
    (teamsData?.['teamsChannelId'] as string) ||
    activity.conversation.id;

  const sub = await getSubscriptionByChannelId(channelId);
  if (!sub) {
    return { success: false, message: '❌ This channel is not registered. Use `@RGMC IT Bot register <CODE>` first.' };
  }

  if (args[0] === 'all') {
    await updateSubscriptionFilters(channelId, {
      priority_filter: null,
      type_filter: null,
      notify_created: true,
      notify_updated: true,
      notify_resolved: true,
    });
    return { success: true, message: '✅ Configured to receive **all** ticket notifications.' };
  }

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const validTypes = ['incident', 'service_request', 'change_request'];

  const priorities = args.filter((a) => validPriorities.includes(a.toLowerCase()));
  const types = args.filter((a) => validTypes.includes(a.toLowerCase()));

  await updateSubscriptionFilters(channelId, {
    priority_filter: priorities.length > 0 ? priorities : null,
    type_filter: types.length > 0 ? types : null,
  });

  const lines: string[] = ['✅ Notification filters updated:'];
  if (priorities.length > 0) lines.push(`• Priority: ${priorities.join(', ')}`);
  if (types.length > 0) lines.push(`• Type: ${types.join(', ')}`);
  if (priorities.length === 0 && types.length === 0) {
    lines.push('• No valid filters recognized — receiving all notifications');
  }

  return { success: true, message: lines.join('\n') };
}

export async function getChannelStatus(context: TurnContext): Promise<string> {
  const activity = context.activity;
  const teamsData = activity.channelData as Record<string, unknown> | undefined;
  const channelId: string =
    (teamsData?.['teamsChannelId'] as string) ||
    activity.conversation.id;

  const sub = await getSubscriptionByChannelId(channelId);
  if (!sub) {
    return '📭 This channel is **not registered** for ticket notifications.\n\nAsk your IT admin for a registration code, then run:\n`@RGMC IT Bot register <CODE>`';
  }

  const filters: string[] = [];
  if (sub.priority_filter?.length) filters.push(`• Priority: ${sub.priority_filter.join(', ')}`);
  if (sub.type_filter?.length) filters.push(`• Type: ${sub.type_filter.join(', ')}`);

  return [
    `📬 This channel is **registered** for ticket notifications.`,
    `• Code: \`${sub.registration_code}\``,
    `• Created: ${new Date(sub.created_at).toLocaleDateString()}`,
    `• On ticket created: ${sub.notify_created ? '✅' : '❌'}`,
    `• On ticket updated: ${sub.notify_updated ? '✅' : '❌'}`,
    `• On ticket resolved: ${sub.notify_resolved ? '✅' : '❌'}`,
    ...(filters.length ? ['**Active filters:**', ...filters] : ['• Filter: none (all tickets)']),
  ].join('\n');
}

export function matchesFilters(
  subscription: BotSubscription,
  ticket: { priority?: string | null; ticket_type?: string | null },
  eventType: 'created' | 'updated' | 'resolved'
): boolean {
  if (eventType === 'created' && !subscription.notify_created) return false;
  if (eventType === 'updated' && !subscription.notify_updated) return false;
  if (eventType === 'resolved' && !subscription.notify_resolved) return false;

  if (subscription.priority_filter?.length && ticket.priority) {
    if (!subscription.priority_filter.includes(ticket.priority.toLowerCase())) return false;
  }

  if (subscription.type_filter?.length && ticket.ticket_type) {
    if (!subscription.type_filter.includes(ticket.ticket_type.toLowerCase())) return false;
  }

  return true;
}
