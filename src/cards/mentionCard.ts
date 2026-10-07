import { Attachment, CardFactory } from 'botbuilder';
import { MentionPayload, MentionEntityType } from '../types';

const ENTITY_LABEL: Record<MentionEntityType, string> = {
  issue: 'Issue',
  epic: 'Epic',
  dev_item: 'Dev Item',
  task: 'Task',
};

const ENTITY_ICON: Record<MentionEntityType, string> = {
  issue: '🎫',
  epic: '🧭',
  dev_item: '🛠️',
  task: '✅',
};

function viewAction(url?: string | null) {
  if (!url) return null;
  return {
    type: 'Action.OpenUrl',
    title: '💬  View Comment',
    style: 'positive',
    url,
  };
}

export function buildMentionCard(payload: MentionPayload): Attachment {
  const icon = ENTITY_ICON[payload.entity_type] ?? '📌';
  const kind = ENTITY_LABEL[payload.entity_type] ?? 'Item';
  const by = payload.by_display_name || payload.by_username;
  const action = viewAction(payload.url);

  const card = {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        bleed: true,
        items: [
          {
            type: 'TextBlock',
            text: `${icon}  YOU WERE MENTIONED`,
            size: 'Small',
            weight: 'Bolder',
            color: 'accent',
            spacing: 'None',
          },
          {
            type: 'TextBlock',
            text: payload.entity_label,
            size: 'Large',
            weight: 'Bolder',
            spacing: 'None',
            wrap: true,
          },
          {
            type: 'TextBlock',
            text: `${kind} comment`,
            size: 'Small',
            isSubtle: true,
            spacing: 'None',
          },
        ],
      },
      {
        type: 'TextBlock',
        text: `**${by}** mentioned you:`,
        size: 'Small',
        spacing: 'Medium',
        wrap: true,
      },
      {
        type: 'Container',
        style: 'default',
        separator: true,
        spacing: 'Small',
        items: [
          {
            type: 'TextBlock',
            text: payload.comment_excerpt,
            wrap: true,
            size: 'Small',
            isSubtle: true,
          },
        ],
      },
    ],
    actions: action ? [action] : [],
  };

  return CardFactory.adaptiveCard(card);
}
