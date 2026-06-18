import { Attachment, CardFactory } from 'botbuilder';
import { Ticket, TicketChanges } from '../types';
import { config } from '../config';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'attention',
  high: 'warning',
  medium: 'accent',
  low: 'good',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'accent',
  in_progress: 'warning',
  resolved: 'good',
  closed: 'default',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] || 'default';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function logoUrl(): string | null {
  if (!config.botBaseUrl) return null;
  return `${config.botBaseUrl.replace(/\/$/, '')}/static/logo.png`;
}

function viewTicketAction(ticket: Ticket) {
  if (!config.gatewayBaseUrl || !ticket.id) return null;
  return {
    type: 'Action.OpenUrl',
    title: 'View Ticket',
    url: `${config.gatewayBaseUrl.replace(/\/$/, '')}/admin/issues/${ticket.id}`,
  };
}

function logoColumn() {
  const url = logoUrl();
  if (!url) return null;
  return {
    type: 'Column',
    width: 'auto',
    verticalContentAlignment: 'Center',
    items: [
      {
        type: 'Image',
        url,
        width: '48px',
        style: 'Default',
        altText: 'RGMC',
      },
    ],
  };
}

export function buildTicketCreatedCard(ticket: Ticket): Attachment {
  const displayNumber = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
  const title = ticket.title || ticket.description.slice(0, 80) + (ticket.description.length > 80 ? '…' : '');
  const viewAction = viewTicketAction(ticket);
  const logo = logoColumn();

  const card = {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'ColumnSet',
            columns: [
              ...(logo ? [logo] : []),
              {
                type: 'Column',
                width: 'stretch',
                verticalContentAlignment: 'Center',
                items: [
                  {
                    type: 'TextBlock',
                    text: `🎫 New Ticket — ${displayNumber}`,
                    weight: 'Bolder',
                    size: 'Medium',
                    wrap: false,
                  },
                  {
                    type: 'TextBlock',
                    text: title,
                    size: 'Small',
                    color: 'accent',
                    wrap: true,
                    spacing: 'None',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Status', value: formatStatus(ticket.status) },
          ...(ticket.priority ? [{ title: 'Priority', value: `**${ticket.priority.toUpperCase()}**` }] : []),
          { title: 'Reporter', value: `${ticket.employee_name} — ${ticket.company_name}` },
          ...(ticket.department ? [{ title: 'Department', value: ticket.department }] : []),
          { title: 'System / Site', value: ticket.site_name },
          ...(ticket.ticket_type ? [{ title: 'Type', value: ticket.ticket_type }] : []),
          ...(ticket.request_category ? [{ title: 'Category', value: ticket.request_category }] : []),
          { title: 'Submitted', value: new Date(ticket.created_at).toLocaleString() },
        ],
        spacing: 'Medium',
      },
      {
        type: 'TextBlock',
        text: ticket.description.length > 300
          ? ticket.description.slice(0, 300) + '…'
          : ticket.description,
        wrap: true,
        size: 'Small',
        color: 'default',
        spacing: 'Small',
        isSubtle: true,
      },
    ],
    actions: [...(viewAction ? [viewAction] : [])],
  };

  return CardFactory.adaptiveCard(card);
}

export function buildTicketUpdatedCard(ticket: Ticket, changes: TicketChanges): Attachment {
  const displayNumber = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
  const title = ticket.title || ticket.description.slice(0, 60) + '…';
  const viewAction = viewTicketAction(ticket);
  const logo = logoColumn();

  const changedFields = Object.entries(changes)
    .filter(([, v]) => v.from !== v.to)
    .map(([field, v]) => ({
      title: field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      value: `~~${v.from ?? '(none)'}~~ → **${v.to ?? '(none)'}**`,
    }));

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
  const headerEmoji = isResolved ? '✅' : '🔄';

  const card = {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'ColumnSet',
            columns: [
              ...(logo ? [logo] : []),
              {
                type: 'Column',
                width: 'stretch',
                verticalContentAlignment: 'Center',
                items: [
                  {
                    type: 'TextBlock',
                    text: `${headerEmoji} Ticket Updated — ${displayNumber}`,
                    weight: 'Bolder',
                    size: 'Medium',
                    wrap: false,
                  },
                  {
                    type: 'TextBlock',
                    text: title,
                    size: 'Small',
                    color: statusColor(ticket.status) as string,
                    wrap: true,
                    spacing: 'None',
                  },
                ],
              },
            ],
          },
        ],
      },
      ...(changedFields.length > 0
        ? [
            {
              type: 'TextBlock',
              text: 'What changed',
              weight: 'Bolder',
              size: 'Small',
              spacing: 'Medium',
            },
            {
              type: 'FactSet',
              facts: changedFields,
            },
          ]
        : []),
      {
        type: 'TextBlock',
        text: 'Current state',
        weight: 'Bolder',
        size: 'Small',
        spacing: 'Medium',
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Status', value: `**${formatStatus(ticket.status)}**` },
          ...(ticket.assigned_to ? [{ title: 'Assigned To', value: ticket.assigned_to }] : [{ title: 'Assigned To', value: '_(unassigned)_' }]),
          ...(ticket.resolution_notes ? [{ title: 'Resolution', value: ticket.resolution_notes }] : []),
          ...(ticket.resolved_by ? [{ title: 'Resolved By', value: ticket.resolved_by }] : []),
        ],
      },
    ],
    actions: [...(viewAction ? [viewAction] : [])],
  };

  return CardFactory.adaptiveCard(card);
}

export function buildTicketStatusCard(ticket: Ticket): Attachment {
  const displayNumber = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
  const title = ticket.title || ticket.description.slice(0, 80) + (ticket.description.length > 80 ? '…' : '');
  const viewAction = viewTicketAction(ticket);
  const logo = logoColumn();

  const card = {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'ColumnSet',
            columns: [
              ...(logo ? [logo] : []),
              {
                type: 'Column',
                width: 'stretch',
                verticalContentAlignment: 'Center',
                items: [
                  {
                    type: 'TextBlock',
                    text: `Ticket ${displayNumber}`,
                    weight: 'Bolder',
                    size: 'Large',
                    wrap: false,
                  },
                  {
                    type: 'TextBlock',
                    text: title,
                    size: 'Small',
                    wrap: true,
                    spacing: 'None',
                    isSubtle: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'FactSet',
        spacing: 'Medium',
        facts: [
          { title: 'Status', value: `**${formatStatus(ticket.status)}**` },
          ...(ticket.priority ? [{ title: 'Priority', value: ticket.priority.toUpperCase() }] : []),
          { title: 'Reporter', value: `${ticket.employee_name} (${ticket.company_name})` },
          ...(ticket.assigned_to ? [{ title: 'Assigned To', value: ticket.assigned_to }] : [{ title: 'Assigned To', value: '_(unassigned)_' }]),
          { title: 'Submitted', value: new Date(ticket.created_at).toLocaleString() },
          ...(ticket.resolved_at ? [{ title: 'Resolved At', value: new Date(ticket.resolved_at).toLocaleString() }] : []),
          ...(ticket.resolution_notes ? [{ title: 'Resolution Notes', value: ticket.resolution_notes }] : []),
        ],
      },
    ],
    actions: [...(viewAction ? [viewAction] : [])],
  };

  return CardFactory.adaptiveCard(card);
}
