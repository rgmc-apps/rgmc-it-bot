import { Attachment, CardFactory } from 'botbuilder';
import { Outage } from '../types';
import { config } from '../config';

function logoUrl(): string | null {
  if (!config.botBaseUrl) return null;
  return `${config.botBaseUrl.replace(/\/$/, '')}/static/logo.png`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function buildOutageCard(outage: Outage, issueCount: number): Attachment {
  const logo         = logoUrl();
  const adminUrl     = config.gatewayBaseUrl
    ? `${config.gatewayBaseUrl.replace(/\/$/, '')}/admin`
    : null;

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body:    [
      // Header
      {
        type:  'Container',
        style: 'attention' as const,
        bleed: true,
        items: [{
          type:    'ColumnSet',
          columns: [
            {
              type:  'Column',
              width: 'stretch',
              items: [
                {
                  type:    'TextBlock',
                  text:    '🚨  OUTAGE DETECTED',
                  size:    'Small',
                  weight:  'Bolder',
                  color:   'attention',
                  spacing: 'None',
                },
                {
                  type:    'TextBlock',
                  text:    outage.site_name,
                  size:    'ExtraLarge',
                  weight:  'Bolder',
                  spacing: 'None',
                  wrap:    false,
                },
                {
                  type:     'TextBlock',
                  text:     `Error: ${outage.error_code}`,
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
        }],
      },
      // Warning strip
      {
        type:    'Container',
        style:   'attention' as const,
        bleed:   true,
        spacing: 'None',
        items:   [{
          type:    'TextBlock',
          text:    `⚠️  Multiple users reporting the same error — Notification ${outage.notification_count} of 2`,
          size:    'Small',
          weight:  'Bolder',
          spacing: 'None',
          wrap:    true,
        }],
      },
      // Facts
      {
        type:    'TextBlock',
        text:    'DETAILS',
        size:    'Small',
        weight:  'Bolder',
        color:   'accent',
        spacing: 'Medium',
      },
      {
        type:  'FactSet',
        facts: [
          { title: 'System',      value: outage.site_name  },
          { title: 'Error Code',  value: `\`${outage.error_code}\`` },
          { title: 'Reports',     value: `**${issueCount}** issue(s) with matching error code` },
          { title: 'Detected At', value: fmtDate(outage.triggered_at) },
          { title: 'Status',      value: outage.status.charAt(0).toUpperCase() + outage.status.slice(1) },
        ],
      },
    ],
    actions: [
      ...(adminUrl ? [{
        type:  'Action.OpenUrl',
        title: '🔧  Manage Outages',
        style: 'positive',
        url:   adminUrl,
      }] : []),
    ],
  };

  return CardFactory.adaptiveCard(card);
}
