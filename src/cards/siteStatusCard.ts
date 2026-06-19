import { Attachment, CardFactory } from 'botbuilder';
import { PingResult } from '../types';

type ContainerStyle = 'default' | 'emphasis' | 'good' | 'attention' | 'warning';

// ── Status mappings ───────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, ContainerStyle> = {
  ok:      'good',
  error:   'attention',
  down:    'attention',
  timeout: 'warning',
  no_url:  'default',
};

const STATUS_ICON: Record<string, string> = {
  ok:      '🟢',
  error:   '🔴',
  down:    '🔴',
  timeout: '🟡',
  no_url:  '⚪',
};

const STATUS_LABEL: Record<string, string> = {
  ok:      'ONLINE',
  error:   'ERROR',
  down:    'DOWN',
  timeout: 'TIMEOUT',
  no_url:  'NO URL',
};

// ── Latency label ─────────────────────────────────────────────────────────────

function latencyLabel(ms: number): string {
  if (ms < 200)  return `${ms}ms ⚡`;
  if (ms < 600)  return `${ms}ms 🐇`;
  return `${ms}ms 🐢`;
}

// ── Per-system row ────────────────────────────────────────────────────────────

function systemRow(result: PingResult, bleed: boolean) {
  const style  = STATUS_STYLE[result.status]  ?? 'default';
  const icon   = STATUS_ICON[result.status]   ?? '⚪';
  const label  = STATUS_LABEL[result.status]  ?? result.status.toUpperCase();

  // Right column: status label + latency or error detail
  const rightLines: object[] = [
    {
      type:    'TextBlock',
      text:    `${icon}  ${label}`,
      weight:  'Bolder',
      size:    'Small',
      spacing: 'None',
      wrap:    false,
    },
  ];

  if (result.latency_ms !== undefined) {
    rightLines.push({
      type:     'TextBlock',
      text:     latencyLabel(result.latency_ms),
      size:     'Small',
      isSubtle: true,
      spacing:  'None',
    });
  }

  if (result.http_status !== undefined && result.status !== 'ok') {
    rightLines.push({
      type:     'TextBlock',
      text:     `HTTP ${result.http_status}`,
      size:     'Small',
      isSubtle: true,
      spacing:  'None',
    });
  }

  if (result.error && result.status !== 'ok') {
    rightLines.push({
      type:     'TextBlock',
      text:     result.error,
      size:     'Small',
      isSubtle: true,
      spacing:  'None',
      wrap:     true,
      maxLines: 2,
    });
  }

  // Left column: system name + URL
  const leftLines: object[] = [
    {
      type:    'TextBlock',
      text:    result.name,
      weight:  'Bolder',
      size:    'Small',
      spacing: 'None',
      wrap:    true,
    },
  ];

  if (result.url) {
    // Truncate long URLs for readability
    const displayUrl = result.url.length > 40
      ? result.url.slice(0, 37) + '…'
      : result.url;
    leftLines.push({
      type:     'TextBlock',
      text:     displayUrl,
      size:     'Small',
      isSubtle: true,
      spacing:  'None',
      wrap:     false,
    });
  }

  return {
    type:    'Container',
    style,
    bleed,
    spacing: 'Small',
    items:   [{
      type:    'ColumnSet',
      columns: [
        {
          type:                     'Column',
          width:                    'stretch',
          verticalContentAlignment: 'Center',
          items:                    leftLines,
        },
        {
          type:                     'Column',
          width:                    'auto',
          verticalContentAlignment: 'Center',
          items:                    rightLines,
          horizontalAlignment:      'Right',
        },
      ],
    }],
  };
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function buildSiteStatusCard(site: string, results: PingResult[]): Attachment {
  const allOk   = results.every(r => r.status === 'ok');
  const anyDown = results.some(r => r.status === 'down' || r.status === 'error');
  const allDown = results.every(r => r.status === 'down' || r.status === 'error');

  const overallIcon  = allOk ? '🟢' : anyDown ? '🔴' : '🟡';
  const overallLabel = allOk ? 'ALL SYSTEMS UP' : allDown ? 'ALL SYSTEMS DOWN' : 'SOME ISSUES DETECTED';
  const headerStyle: ContainerStyle = allOk ? 'good' : anyDown ? 'attention' : 'warning';

  const count = results.length;
  const onlineCount = results.filter(r => r.status === 'ok').length;

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body:    [
      // Header
      {
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
                    text:    '🖥️  SITE CHECK',
                    size:    'Small',
                    weight:  'Bolder',
                    color:   'accent',
                    spacing: 'None',
                  },
                  {
                    type:    'TextBlock',
                    text:    site.toUpperCase(),
                    size:    'ExtraLarge',
                    weight:  'Bolder',
                    spacing: 'None',
                    wrap:    false,
                  },
                  {
                    type:     'TextBlock',
                    text:     `${count} system${count !== 1 ? 's' : ''} checked`,
                    size:     'Small',
                    isSubtle: true,
                    spacing:  'None',
                  },
                ],
              },
            ],
          },
        ],
      },
      // Overall status strip
      {
        type:    'Container',
        style:   headerStyle,
        bleed:   true,
        spacing: 'None',
        items:   [{
          type:    'ColumnSet',
          columns: [
            {
              type:  'Column',
              width: 'stretch',
              items: [{
                type:    'TextBlock',
                text:    `${overallIcon}  ${overallLabel}`,
                size:    'Small',
                weight:  'Bolder',
                spacing: 'None',
              }],
            },
            {
              type:  'Column',
              width: 'auto',
              items: [{
                type:    'TextBlock',
                text:    `${onlineCount}/${count} online`,
                size:    'Small',
                weight:  'Bolder',
                spacing: 'None',
              }],
            },
          ],
        }],
      },
      // Per-system rows — bleed:true so they break to card edge
      ...results.map(r => systemRow(r, true)),
    ],
    actions: [],
  };

  return CardFactory.adaptiveCard(card);
}
