import { Attachment, CardFactory } from 'botbuilder';

type CardColor = 'default' | 'accent' | 'good' | 'warning' | 'attention' | 'light' | 'dark' | 'subtle';

// ── Primitives ────────────────────────────────────────────────────────────────

function cmdRow(command: string, description: string, color: CardColor) {
  return {
    type:    'Container',
    spacing: 'Small',
    items:   [
      {
        type:     'TextBlock',
        text:     command,
        fontType: 'Monospace',
        weight:   'Bolder',
        size:     'Small',
        color,
        wrap:     true,
        spacing:  'None',
      },
      {
        type:     'TextBlock',
        text:     description,
        size:     'Small',
        isSubtle: true,
        wrap:     true,
        spacing:  'None',
      },
    ],
  };
}

function sectionHeader(icon: string, label: string, color: CardColor) {
  return {
    type:      'TextBlock',
    text:      `${icon}  ${label}`,
    weight:    'Bolder',
    size:      'Small',
    color,
    separator: true,
    spacing:   'Medium',
  };
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function buildHelpCard(): Attachment {
  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body:    [
      // ── Header ──────────────────────────────────────────────────────────────
      {
        type:  'Container',
        style: 'emphasis',
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
                    text:    'RGMC IT BOT',
                    size:    'ExtraLarge',
                    weight:  'Bolder',
                    spacing: 'None',
                    wrap:    false,
                  },
                  {
                    type:     'TextBlock',
                    text:     '🤖  Command Reference',
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

      // ── 📢 Channel ───────────────────────────────────────────────────────────
      sectionHeader('📢', 'CHANNEL', 'good'),
      cmdRow(
        'register <CODE>',
        'Register this channel to receive ticket notifications.',
        'good',
      ),
      cmdRow(
        'unregister',
        'Stop receiving ticket notifications in this channel.',
        'attention',
      ),
      cmdRow(
        'status',
        'Show the current notification configuration for this channel.',
        'good',
      ),
      cmdRow(
        'configure all',
        'Reset filters — receive notifications for all tickets.',
        'good',
      ),
      cmdRow(
        'configure priority high critical',
        'Only receive high/critical priority ticket notifications.',
        'good',
      ),
      cmdRow(
        'configure type incident service_request',
        'Only receive specific ticket type notifications.',
        'good',
      ),

      // ── 🎫 Tickets ───────────────────────────────────────────────────────────
      sectionHeader('🎫', 'TICKETS', 'warning'),
      cmdRow(
        'ticket <NUMBER>',
        'Look up the status of a ticket (e.g. ticket IT-0042).',
        'warning',
      ),

      // ── 🌐 Sites ─────────────────────────────────────────────────────────────
      sectionHeader('🌐', 'SITES', 'accent'),
      cmdRow(
        'gumagana po ba yung <SITE>',
        'Check if a site is up and get its response time.',
        'accent',
      ),
      cmdRow(
        'anong site po yung <SYSTEM>',
        'Get the URL(s) configured for a system.',
        'accent',
      ),

      // ── 💬 AI ────────────────────────────────────────────────────────────────
      sectionHeader('💬', 'AI ASSISTANT', 'attention'),
      cmdRow(
        'ask <QUESTION>',
        'Ask anything IT-related — answered by AI.',
        'attention',
      ),

      // ── Footer ───────────────────────────────────────────────────────────────
      {
        type:     'TextBlock',
        text:     'Tip: question marks at the end of commands are ignored 😉',
        size:     'Small',
        isSubtle: true,
        wrap:     true,
        separator: true,
        spacing:  'Medium',
      },
    ],
    actions: [],
  };

  return CardFactory.adaptiveCard(card);
}
