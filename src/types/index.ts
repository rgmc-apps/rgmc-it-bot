import { ConversationReference } from 'botbuilder';

export interface Ticket {
  id: string;
  ticket_number: string | null;
  title: string | null;
  description: string;
  status: string;
  priority: string | null;
  urgency: string | null;
  assigned_to: string | null;
  employee_name: string;
  company_name: string;
  department: string;
  site_name: string;
  ticket_type: string | null;
  request_category: string | null;
  request_subcategory: string | null;
  email: string;
  viber_number: string;
  from_helpdesk: boolean;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  attachment_urls: string[] | null;
}

export interface TicketChange {
  from: string | null;
  to: string | null;
}

export interface TicketChanges {
  [field: string]: TicketChange;
}

export interface BotSubscription {
  id: string;
  channel_id: string;
  service_url: string;
  conversation_ref: Partial<ConversationReference>;
  tenant_id: string | null;
  team_id: string | null;
  channel_name: string | null;
  registration_code: string;
  priority_filter: string[] | null;
  type_filter: string[] | null;
  department_filter: string | null;
  notify_created: boolean;
  notify_updated: boolean;
  notify_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegistrationCode {
  code: string;
  label: string | null;
  used: boolean;
  used_by_channel: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface NotifyTicketPayload {
  event: 'ticket.created' | 'ticket.updated';
  ticket: Ticket;
  changes?: TicketChanges;
}

export interface System {
  id: string;
  name: string;
  tags: string | null;
  primary_url: string | null;
  primary_label: string | null;
  backup_url: string | null;
  backup_label: string | null;
  category: string | null;
}

export interface PingResult {
  id: string;
  name: string;
  url?: string;
  status: 'ok' | 'error' | 'timeout' | 'down' | 'no_url';
  http_status?: number;
  latency_ms?: number;
  error?: string;
}
