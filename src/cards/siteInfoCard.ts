import { Attachment, CardFactory } from 'botbuilder';
import { System } from '../types';

function urlBlock(system: System) {
  const items: object[] = [
    {
      type:    'TextBlock',
      text:    system.name,
      weight:  'Bolder',
      size:    'Medium',
      wrap:    true,
      spacing: 'None',
    },
  ];

  if (system.category) {
    items.push({
      type:     'TextBlock',
      text:     system.category.toUpperCase(),
      size:     'Small',
      color:    'accent',
      isSubtle: true,
      spacing:  'None',
    });
  }

  if (system.primary_url) {
    items.push(
      {
        type:    'TextBlock',
        text:    `🌐  ${system.primary_label || 'Primary'}`,
        weight:  'Bolder',
        size:    'Small',
        spacing: 'Medium',
      },
      {
        type:    'TextBlock',
        text:    system.primary_url,
        size:    'Small',
        color:   'accent',
        wrap:    true,
        spacing: 'None',
      },
    );
  }

  if (system.backup_url) {
    items.push(
      {
        type:    'TextBlock',
        text:    `🔗  ${system.backup_label || 'Backup'}`,
        weight:  'Bolder',
        size:    'Small',
        spacing: 'Small',
      },
      {
        type:     'TextBlock',
        text:     system.backup_url,
        size:     'Small',
        isSubtle: true,
        wrap:     true,
        spacing:  'None',
      },
    );
  }

  if (!system.primary_url && !system.backup_url) {
    items.push({
      type:     'TextBlock',
      text:     '⚠️  No URL configured for this system.',
      size:     'Small',
      isSubtle: true,
      spacing:  'Medium',
    });
  }

  // Actions — one button per available URL
  const actions: object[] = [];
  if (system.primary_url) {
    actions.push({
      type:  'Action.OpenUrl',
      title: `🌐  ${system.primary_label || 'Open Primary'}`,
      url:   system.primary_url,
    });
  }
  if (system.backup_url) {
    actions.push({
      type:  'Action.OpenUrl',
      title: `🔗  ${system.backup_label || 'Open Backup'}`,
      url:   system.backup_url,
    });
  }

  return { items, actions };
}

export function buildSiteInfoCard(tag: string, systems: System[]): Attachment {
  const count = systems.length;

  // Single system — show full detail with open buttons
  if (count === 1) {
    const { items, actions } = urlBlock(systems[0]);
    const card = {
      type:    'AdaptiveCard',
      version: '1.4',
      body:    [
        {
          type:  'Container',
          style: 'emphasis',
          bleed: true,
          items: [
            {
              type:    'TextBlock',
              text:    '🔗  SITE DIRECTORY',
              size:    'Small',
              weight:  'Bolder',
              color:   'accent',
              spacing: 'None',
            },
            {
              type:    'TextBlock',
              text:    tag.toUpperCase(),
              size:    'ExtraLarge',
              weight:  'Bolder',
              spacing: 'None',
              wrap:    false,
            },
          ],
        },
        {
          type:    'Container',
          spacing: 'Medium',
          items,
        },
      ],
      actions,
    };
    return CardFactory.adaptiveCard(card);
  }

  // Multiple systems — list each in its own container, no buttons (too cluttered)
  const systemContainers = systems.map((s, i) => {
    const { items } = urlBlock(s);
    return {
      type:      'Container',
      separator: i > 0,
      spacing:   i > 0 ? 'Medium' : 'Small',
      items,
    };
  });

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body:    [
      {
        type:  'Container',
        style: 'emphasis',
        bleed: true,
        items: [
          {
            type:    'TextBlock',
            text:    '🔗  SITE DIRECTORY',
            size:    'Small',
            weight:  'Bolder',
            color:   'accent',
            spacing: 'None',
          },
          {
            type:    'TextBlock',
            text:    tag.toUpperCase(),
            size:    'ExtraLarge',
            weight:  'Bolder',
            spacing: 'None',
            wrap:    false,
          },
          {
            type:     'TextBlock',
            text:     `${count} systems found`,
            size:     'Small',
            isSubtle: true,
            spacing:  'None',
          },
        ],
      },
      ...systemContainers,
    ],
    actions: [],
  };

  return CardFactory.adaptiveCard(card);
}
