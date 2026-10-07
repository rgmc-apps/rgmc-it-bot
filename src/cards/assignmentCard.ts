import { Attachment, CardFactory } from 'botbuilder';
import { AssignmentPayload, MentionEntityType } from '../types';

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
    title: '📋  View',
    style: 'positive',
    url,
  };
}

export function buildAssignmentCard(payload: AssignmentPayload): Attachment {
  const icon = ENTITY_ICON[payload.entity_type] ?? '📌';
  const kind = ENTITY_LABEL[payload.entity_type] ?? 'Item';
  const by = payload.assigned_by_display_name || payload.assigned_by;
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
            text: `${icon}  NEW ASSIGNMENT`,
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
            text: payload.title,
            size: 'Small',
            isSubtle: true,
            spacing: 'None',
            wrap: true,
          },
        ],
      },
      {
        type: 'TextBlock',
        text: `**${by}** assigned this ${kind.toLowerCase()} to you.`,
        size: 'Small',
        spacing: 'Medium',
        wrap: true,
      },
    ],
    actions: action ? [action] : [],
  };

  return CardFactory.adaptiveCard(card);
}
