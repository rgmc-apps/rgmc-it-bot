import { Attachment, CardFactory } from 'botbuilder';
import { PingResult } from '../types';

type ContainerStyle = 'good' | 'attention' | 'warning' | 'default' | 'emphasis';

const STATUS_STYLE: Record<string, ContainerStyle> = {
  ok:      'good',
  error:   'attention',
  down:    'attention',
  timeout: 'warning',
  no_url:  'default',
};

const STATUS_LABEL: Record<string, string> = {
  ok:      '✅ Online',
  error:   '❌ Error',
  down:    '❌ Down',
  timeout: '⏱️ Timeout',
  no_url:  '⚠️ No URL',
};

function systemBlock(result: PingResult) {
  const style = STATUS_STYLE[result.status] ?? 'default';
  const label = STATUS_LABEL[result.status] ?? result.status;

  const facts: { title: string; value: string }[] = [
    { title: 'Status', value: `**${label}**` },
  ];
  if (result.url) {
    facts.push({ title: 'URL', value: result.url });
  }
  if (result.http_status !== undefined) {
    facts.push({ title: 'HTTP', value: String(result.http_status) });
  }
  if (result.latency_ms !== undefined) {
    facts.push({ title: 'Latency', value: `${result.latency_ms} ms` });
  }
  if (result.error && result.status !== 'ok') {
    facts.push({ title: 'Detail', value: result.error });
  }

  return {
    type: 'Container',
    style,
    spacing: 'Medium',
    items: [
      {
        type: 'TextBlock',
        text: result.name,
        weight: 'Bolder',
        size: 'Small',
        wrap: true,
      },
      {
        type: 'FactSet',
        facts,
        spacing: 'Small',
      },
    ],
  };
}

export function buildSiteStatusCard(site: string, results: PingResult[]): Attachment {
  const allOk    = results.every(r => r.status === 'ok');
  const anyDown  = results.some(r => r.status === 'down' || r.status === 'error');
  const headerEmoji = allOk ? '✅' : anyDown ? '❌' : '⚠️';

  const card = {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'TextBlock',
            text: `${headerEmoji} Site Check — ${site}`,
            weight: 'Bolder',
            size: 'Medium',
            wrap: false,
          },
          {
            type: 'TextBlock',
            text: `${results.length} system${results.length !== 1 ? 's' : ''} checked`,
            size: 'Small',
            isSubtle: true,
            spacing: 'None',
          },
        ],
      },
      ...results.map(systemBlock),
    ],
    actions: [],
  };

  return CardFactory.adaptiveCard(card);
}
