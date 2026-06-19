import { Attachment, CardFactory } from 'botbuilder';
import { Ticket, TicketChanges } from '../types';
import { config } from '../config';

// ── Types ─────────────────────────────────────────────────────────────────────

type ContainerStyle = 'default' | 'emphasis' | 'good' | 'attention' | 'warning';

// ── Priority ──────────────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<string, ContainerStyle> = {
  critical: 'attention',
  high:     'warning',
  medium:   'emphasis',
  low:      'good',
};

const PRIORITY_ICON: Record<string, string> = {
  critical: '🔴',
  high:     '🟠',
  medium:   '🔵',
  low:      '🟢',
};

// ── Status ────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, ContainerStyle> = {
  pending:     'emphasis',
  in_progress: 'warning',
  resolved:    'good',
  closed:      'default',
};

const STATUS_ICON: Record<string, string> = {
  pending:     '🕐',
  in_progress: '⚡',
  resolved:    '✅',
  closed:      '🔒',
};

function getStatusStyle(status: string): ContainerStyle {
  return STATUS_STYLE[status.toLowerCase()] ?? 'default';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function logoUrl(): string | null {
  if (!config.botBaseUrl) return null;
  return `${config.botBaseUrl.replace(/\/$/, '')}/static/logo.png`;
}

function viewTicketAction(ticket: Ticket) {
  if (!config.gatewayBaseUrl || !ticket.id) return null;
  return {
    type:  'Action.OpenUrl',
    title: '📋  View Ticket',
    style: 'positive',
    url:   `${config.gatewayBaseUrl.replace(/\/$/, '')}/admin/issues/${ticket.id}`,
  };
}

// Full-bleed header — large ticket number + label + subtitle
function headerContainer(displayNumber: string, label: string, subtitle: string) {
  const logo = logoUrl();
  return {
    type:  'Container',
    style: 'emphasis' as ContainerStyle,
    bleed: true,
    items: [
      {
        type:    'ColumnSet',
        columns: [
          {
            type:  'Column',
            width: 'stretch',
            items: [
              {
                type:    'TextBlock',
                text:    label,
                size:    'Small',
                weight:  'Bolder',
                color:   'accent',
                spacing: 'None',
              },
              {
                type:    'TextBlock',
                text:    displayNumber,
                size:    'ExtraLarge',
                weight:  'Bolder',
                spacing: 'None',
                wrap:    false,
              },
              {
                type:     'TextBlock',
                text:     subtitle,
                size:     'Small',
                wrap:     true,
                spacing:  'None',
                isSubtle: true,
                maxLines: 2,
              },
            ],
          },
          ...(logo ? [{
            type:                     'Column',
            width:                    'auto',
            verticalContentAlignment: 'Center',
            items: [{
              type:    'Image',
              url:     logo,
              width:   '44px',
              style:   'Default',
              altText: 'RGMC',
            }],
          }] : []),
        ],
      },
    ],
  };
}

// Thin full-bleed strip for priority
function priorityStrip(priority: string) {
  const style = PRIORITY_STYLE[priority.toLowerCase()] ?? 'default';
  const icon  = PRIORITY_ICON[priority.toLowerCase()] ?? '⚪';
  return {
    type:    'Container',
    style,
    bleed:   true,
    spacing: 'None',
    items:   [{
      type:    'TextBlock',
      text:    `${icon}  ${priority.toUpperCase()} PRIORITY`,
      size:    'Small',
      weight:  'Bolder',
      spacing: 'None',
    }],
  };
}

// Thin full-bleed strip for current status
function statusStrip(status: string) {
  const style = getStatusStyle(status);
  const icon  = STATUS_ICON[status.toLowerCase()] ?? '📋';
  return {
    type:    'Container',
    style,
    bleed:   true,
    spacing: 'None',
    items:   [{
      type:    'TextBlock',
      text:    `${icon}  ${formatStatus(status).toUpperCase()}`,
      size:    'Small',
      weight:  'Bolder',
      spacing: 'None',
    }],
  };
}

// ── Ticket Created ────────────────────────────────────────────────────────────

export function buildTicketCreatedCard(ticket: Ticket): Attachment {
  const displayNumber = ticket.ticket_number ?? ticket.id.slice(0, 8).toUpperCase();
  const title = ticket.title
    ?? ticket.description.slice(0, 80) + (ticket.description.length > 80 ? '…' : '');
  const viewAction = viewTicketAction(ticket);
  const prio = ticket.priority?.toLowerCase() ?? '';

  // Reporter / Type / Dept columns — only include non-empty
  const infoCols: object[] = [
    {
      type:  'Column',
      width: 'stretch',
      items: [
        { type: 'TextBlock', text: 'REPORTER', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
        { type: 'TextBlock', text: ticket.employee_name, size: 'Small', spacing: 'None', wrap: true },
        { type: 'TextBlock', text: ticket.company_name, size: 'Small', isSubtle: true, spacing: 'None', wrap: true },
      ],
    },
  ];

  if (ticket.ticket_type) {
    infoCols.push({
      type:  'Column',
      width: 'stretch',
      items: [
        { type: 'TextBlock', text: 'TYPE', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
        { type: 'TextBlock', text: ticket.ticket_type, size: 'Small', spacing: 'None', wrap: true },
        ...(ticket.request_category
          ? [{ type: 'TextBlock', text: ticket.request_category, size: 'Small', isSubtle: true, spacing: 'None' }]
          : []),
      ],
    });
  }

  if (ticket.department) {
    infoCols.push({
      type:  'Column',
      width: 'stretch',
      items: [
        { type: 'TextBlock', text: 'DEPT', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
        { type: 'TextBlock', text: ticket.department, size: 'Small', spacing: 'None', wrap: true },
      ],
    });
  }

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body:    [
      headerContainer(displayNumber, '🎫  NEW TICKET', title),
      ...(prio ? [priorityStrip(prio)] : []),
      // Reporter / type / dept grid
      { type: 'ColumnSet', spacing: 'Medium', columns: infoCols },
      // Site
      {
        type:    'TextBlock',
        text:    `📍  ${ticket.site_name}`,
        size:    'Small',
        color:   'accent',
        spacing: 'Small',
        wrap:    true,
      },
      // Description preview
      {
        type:      'Container',
        separator: true,
        spacing:   'Medium',
        items:     [{
          type:     'TextBlock',
          text:     ticket.description.length > 240
            ? ticket.description.slice(0, 240) + '…'
            : ticket.description,
          wrap:     true,
          size:     'Small',
          isSubtle: true,
        }],
      },
    ],
    actions: viewAction ? [viewAction] : [],
  };

  return CardFactory.adaptiveCard(card);
}

// ── Ticket Updated ────────────────────────────────────────────────────────────

export function buildTicketUpdatedCard(ticket: Ticket, changes: TicketChanges): Attachment {
  const displayNumber = ticket.ticket_number ?? ticket.id.slice(0, 8).toUpperCase();
  const title = ticket.title ?? ticket.description.slice(0, 60) + '…';
  const viewAction = viewTicketAction(ticket);

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
  const label = isResolved ? '✅  RESOLVED' : '🔄  TICKET UPDATED';

  const changedFields = Object.entries(changes)
    .filter(([, v]) => v.from !== v.to)
    .map(([field, v]) => ({
      title: field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value: `~~${v.from ?? '(none)'}~~ → **${v.to ?? '(none)'}**`,
    }));

  const currentFacts = [
    ...(ticket.assigned_to
      ? [{ title: 'Assigned To', value: `**${ticket.assigned_to}**` }]
      : [{ title: 'Assigned To', value: '_(unassigned)_' }]),
    ...(ticket.resolution_notes
      ? [{ title: 'Resolution', value: ticket.resolution_notes }]
      : []),
    ...(ticket.resolved_by
      ? [{ title: 'Resolved By', value: ticket.resolved_by }]
      : []),
  ];

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body:    [
      headerContainer(displayNumber, label, title),
      statusStrip(ticket.status),
      // What changed section
      ...(changedFields.length > 0 ? [
        {
          type:    'TextBlock',
          text:    'WHAT CHANGED',
          size:    'Small',
          weight:  'Bolder',
          color:   'accent',
          spacing: 'Medium',
        },
        {
          type:  'FactSet',
          facts: changedFields,
        },
      ] : []),
      // Current state
      {
        type:      'TextBlock',
        text:      'CURRENT STATE',
        size:      'Small',
        weight:    'Bolder',
        color:     'accent',
        spacing:   'Medium',
        separator: changedFields.length === 0,
      },
      { type: 'FactSet', facts: currentFacts },
    ],
    actions: viewAction ? [viewAction] : [],
  };

  return CardFactory.adaptiveCard(card);
}

// ── Ticket Status (response to `ticket` command) ──────────────────────────────

export function buildTicketStatusCard(ticket: Ticket): Attachment {
  const displayNumber = ticket.ticket_number ?? ticket.id.slice(0, 8).toUpperCase();
  const title = ticket.title
    ?? ticket.description.slice(0, 80) + (ticket.description.length > 80 ? '…' : '');
  const viewAction = viewTicketAction(ticket);

  const metaCols: object[] = [
    {
      type:  'Column',
      width: 'stretch',
      items: [
        { type: 'TextBlock', text: 'FILED BY', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
        { type: 'TextBlock', text: ticket.employee_name, size: 'Small', spacing: 'None', wrap: true },
        { type: 'TextBlock', text: `${ticket.company_name}`, size: 'Small', isSubtle: true, spacing: 'None' },
      ],
    },
    {
      type:  'Column',
      width: 'stretch',
      items: [
        { type: 'TextBlock', text: 'FILED ON', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
        {
          type:    'TextBlock',
          text:    new Date(ticket.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
          size:    'Small',
          spacing: 'None',
        },
      ],
    },
  ];

  if (ticket.priority) {
    metaCols.push({
      type:  'Column',
      width: 'stretch',
      items: [
        { type: 'TextBlock', text: 'PRIORITY', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
        {
          type:    'TextBlock',
          text:    `${PRIORITY_ICON[ticket.priority.toLowerCase()] ?? ''} ${ticket.priority.toUpperCase()}`,
          size:    'Small',
          spacing: 'None',
        },
      ],
    });
  }

  const assignedFacts = [
    {
      title: 'Assigned To',
      value: ticket.assigned_to ? `**${ticket.assigned_to}**` : '_(unassigned)_',
    },
    ...(ticket.resolved_at
      ? [{ title: 'Resolved On', value: new Date(ticket.resolved_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) }]
      : []),
    ...(ticket.resolution_notes
      ? [{ title: 'Resolution', value: ticket.resolution_notes }]
      : []),
  ];

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body:    [
      headerContainer(displayNumber, '📋  CASE FILE', title),
      statusStrip(ticket.status),
      // Meta grid
      { type: 'ColumnSet', spacing: 'Medium', columns: metaCols },
      // Assignment + resolution
      {
        type:      'FactSet',
        facts:     assignedFacts,
        separator: true,
        spacing:   'Medium',
      },
    ],
    actions: viewAction ? [viewAction] : [],
  };

  return CardFactory.adaptiveCard(card);
}
