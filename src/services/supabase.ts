import { createClient } from '@supabase/supabase-js';
import { ConversationReference } from 'botbuilder';
import { config } from '../config';
import { BotSubscription, RegistrationCode, System, Ticket } from '../types';

export const db = createClient(config.supabaseUrl, config.supabaseKey);

// ─── Tickets ──────────────────────────────────────────────────────────────────

export async function getTicketByNumber(ticketNumber: string): Promise<Ticket | null> {
  const normalized = ticketNumber.toUpperCase().trim();
  const { data, error } = await db
    .from('issues')
    .select('*')
    .or(`ticket_number.eq.${normalized},ticket_number.ilike.${normalized}`)
    .limit(1)
    .single();
  if (error || !data) return null;
  return data as Ticket;
}

// ─── Systems ──────────────────────────────────────────────────────────────────

export async function findSystemsByTag(site: string): Promise<System[]> {
  const { data, error } = await db
    .from('systems')
    .select('id, name, tags, primary_url, backup_url, category')
    .not('tags', 'is', null);
  if (error || !data) return [];
  const needle = site.toLowerCase().trim();
  return (data as System[]).filter(s => {
    if (!s.tags) return false;
    return s.tags.split(',').map(t => t.trim().toLowerCase()).includes(needle);
  });
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function getSubscriptionByChannelId(channelId: string): Promise<BotSubscription | null> {
  const { data, error } = await db
    .from('bot_subscriptions')
    .select('*')
    .eq('channel_id', channelId)
    .single();
  if (error || !data) return null;
  return data as BotSubscription;
}

export async function getAllSubscriptions(): Promise<BotSubscription[]> {
  const { data, error } = await db
    .from('bot_subscriptions')
    .select('*');
  if (error || !data) return [];
  return data as BotSubscription[];
}

export async function createSubscription(params: {
  channelId: string;
  serviceUrl: string;
  conversationRef: Partial<ConversationReference>;
  tenantId: string | null;
  teamId: string | null;
  channelName: string | null;
  registrationCode: string;
}): Promise<BotSubscription | null> {
  const { data, error } = await db
    .from('bot_subscriptions')
    .upsert({
      channel_id: params.channelId,
      service_url: params.serviceUrl,
      conversation_ref: params.conversationRef,
      tenant_id: params.tenantId,
      team_id: params.teamId,
      channel_name: params.channelName,
      registration_code: params.registrationCode,
      notify_created: true,
      notify_updated: true,
      notify_resolved: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'channel_id' })
    .select()
    .single();
  if (error) {
    console.error('createSubscription error:', error.message);
    return null;
  }
  return data as BotSubscription;
}

export async function deleteSubscription(channelId: string): Promise<boolean> {
  const { error } = await db
    .from('bot_subscriptions')
    .delete()
    .eq('channel_id', channelId);
  return !error;
}

export async function updateSubscriptionFilters(
  channelId: string,
  filters: {
    priority_filter?: string[] | null;
    type_filter?: string[] | null;
    notify_created?: boolean;
    notify_updated?: boolean;
    notify_resolved?: boolean;
  }
): Promise<boolean> {
  const { error } = await db
    .from('bot_subscriptions')
    .update({ ...filters, updated_at: new Date().toISOString() })
    .eq('channel_id', channelId);
  return !error;
}

// ─── Registration codes ───────────────────────────────────────────────────────

export async function getRegistrationCode(code: string): Promise<RegistrationCode | null> {
  const { data, error } = await db
    .from('bot_registration_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();
  if (error || !data) return null;
  return data as RegistrationCode;
}

export async function markCodeUsed(code: string, channelId: string): Promise<void> {
  await db
    .from('bot_registration_codes')
    .update({ used: true, used_by_channel: channelId })
    .eq('code', code.toUpperCase());
}

export async function createRegistrationCode(label: string | null): Promise<RegistrationCode | null> {
  const code = generateRandomCode();
  const { data, error } = await db
    .from('bot_registration_codes')
    .insert({ code, label, used: false })
    .select()
    .single();
  if (error) {
    console.error('createRegistrationCode error:', error.message);
    return null;
  }
  return data as RegistrationCode;
}

export async function listRegistrationCodes(): Promise<RegistrationCode[]> {
  const { data, error } = await db
    .from('bot_registration_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as RegistrationCode[];
}

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
