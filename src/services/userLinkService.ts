import { TurnContext, TeamsInfo } from 'botbuilder';
import {
  getUsernameByEmail,
  usernameExists,
  upsertUserLink,
  deleteUserLinkByUsername,
  getUserLinkByUsername,
  getUserLinkByAadObjectId,
} from './supabase';
import { BotUserLink } from '../types';

// Resolves the link for *this specific Teams identity*, trying the Teams-email
// match first (how `link` creates links), then falling back to the AAD object
// id (how `subscribe me <username>` creates links, which may use a different
// Gateway username than the Teams email would resolve to).
async function resolveOwnLink(context: TurnContext): Promise<BotUserLink | null> {
  const email = await resolveEmail(context);
  const usernameFromEmail = email ? await getUsernameByEmail(email) : null;
  if (usernameFromEmail) {
    const link = await getUserLinkByUsername(usernameFromEmail);
    if (link) return link;
  }
  const aadObjectId = context.activity.from.aadObjectId;
  if (aadObjectId) {
    const link = await getUserLinkByAadObjectId(aadObjectId);
    if (link) return link;
  }
  return null;
}

export interface LinkResult {
  success: boolean;
  message: string;
}

function isPersonalChat(context: TurnContext): boolean {
  return context.activity.conversation?.conversationType === 'personal';
}

async function resolveEmail(context: TurnContext): Promise<string | null> {
  try {
    const member = await TeamsInfo.getMember(context, context.activity.from.id);
    const email = (member.email || member.userPrincipalName || '').toLowerCase().trim();
    return email || null;
  } catch (err) {
    console.error('resolveEmail: TeamsInfo.getMember failed:', (err as Error).message);
    return null;
  }
}

export async function linkPersonalChat(context: TurnContext): Promise<LinkResult> {
  if (!isPersonalChat(context)) {
    return {
      success: false,
      message: '❌ Linking only works in a 1:1 chat with me — not in a channel or group chat. Message me directly in Teams.',
    };
  }

  const email = await resolveEmail(context);
  if (!email) {
    return { success: false, message: "❌ Couldn't read your Teams profile email. Please try again in a bit." };
  }

  const username = await getUsernameByEmail(email);
  if (!username) {
    return {
      success: false,
      message: `❌ No RGMC Gateway account found for **${email}**. Ask IT to make sure your Gateway account's email matches your Teams email.`,
    };
  }

  const activity = context.activity;
  const teamsData = activity.channelData as Record<string, unknown> | undefined;
  const tenantId = (teamsData?.['tenant'] as { id?: string } | undefined)?.id || null;
  const conversationRef = TurnContext.getConversationReference(activity);

  const link = await upsertUserLink({
    username,
    email,
    aadObjectId: activity.from.aadObjectId || null,
    serviceUrl: activity.serviceUrl,
    conversationRef,
    tenantId,
  });

  if (!link) {
    return { success: false, message: '❌ Failed to save your notification link. Please try again.' };
  }

  return {
    success: true,
    message: [
      `✅ Linked to RGMC Gateway account **${username}**!`,
      ``,
      `I'll DM you right here whenever someone **@mentions** you in a comment, or **assigns** you an issue, dev item, or task.`,
      ``,
      `Type \`unlink\` anytime to stop.`,
    ].join('\n'),
  };
}

// Explicit self-service subscribe: `subscribe me <username>` — links this 1:1
// chat straight to the given RGMC Gateway username, skipping the Teams-email
// match (useful when a user's Teams email doesn't match their Gateway email).
export async function linkPersonalChatByUsername(context: TurnContext, usernameInput: string): Promise<LinkResult> {
  if (!isPersonalChat(context)) {
    return {
      success: false,
      message: '❌ Subscribing only works in a 1:1 chat with me — not in a channel or group chat. Message me directly in Teams.',
    };
  }

  const username = usernameInput.trim().toLowerCase();
  if (!username) {
    return { success: false, message: 'Kulang ka ng username. Example: `subscribe me erwin.arellano`' };
  }

  const exists = await usernameExists(username);
  if (!exists) {
    return {
      success: false,
      message: `❌ No RGMC Gateway account found for username **${username}**. Double-check the spelling and try again.`,
    };
  }

  const email = await resolveEmail(context); // best-effort — not required to subscribe
  const activity = context.activity;
  const teamsData = activity.channelData as Record<string, unknown> | undefined;
  const tenantId = (teamsData?.['tenant'] as { id?: string } | undefined)?.id || null;
  const conversationRef = TurnContext.getConversationReference(activity);

  const link = await upsertUserLink({
    username,
    email,
    aadObjectId: activity.from.aadObjectId || null,
    serviceUrl: activity.serviceUrl,
    conversationRef,
    tenantId,
  });

  if (!link) {
    return { success: false, message: '❌ Failed to save your subscription. Please try again.' };
  }

  return {
    success: true,
    message: [
      `✅ Subscribed! This chat is now linked to RGMC Gateway account **${username}**.`,
      ``,
      `I'll DM you right here whenever someone **@mentions** you in a comment, or **assigns** you an issue, dev item, or task.`,
      ``,
      `Type \`unlink\` anytime to stop.`,
    ].join('\n'),
  };
}

export async function unlinkPersonalChat(context: TurnContext): Promise<LinkResult> {
  if (!isPersonalChat(context)) {
    return { success: false, message: '❌ Unlinking only works in a 1:1 chat with me.' };
  }

  const existing = await resolveOwnLink(context);
  if (!existing) {
    return { success: false, message: 'ℹ️ You are not currently linked for notifications — nothing to unlink.' };
  }

  const ok = await deleteUserLinkByUsername(existing.username);
  if (!ok) {
    return { success: false, message: '❌ Failed to unlink. Please try again.' };
  }
  return { success: true, message: '✅ Unlinked — you will no longer receive mention or assignment DMs here.' };
}

export async function getLinkStatusMessage(context: TurnContext): Promise<string> {
  if (!isPersonalChat(context)) {
    return 'ℹ️ Account linking is only available in a 1:1 chat with me.';
  }
  const existing = await resolveOwnLink(context);
  if (!existing) {
    return `📭 Not linked yet. Type \`link\` to auto-link by your Teams email, or \`subscribe me <username>\` to link a specific RGMC Gateway account.`;
  }
  return `📬 Linked to RGMC Gateway account **${existing.username}**. You'll receive mention and assignment DMs here.\n\nType \`unlink\` to stop.`;
}

// Best-effort, silent auto-link attempt when the bot is installed in a
// personal chat — the user hasn't typed anything yet, so failures just
// fall back to asking them to type `link` manually.
export async function autoLinkOnInstall(context: TurnContext): Promise<void> {
  try {
    const result = await linkPersonalChat(context);
    if (result.success) {
      await context.sendActivity([
        `👋 Hi! I'm **RGMC IT Bot**.`,
        ``,
        result.message,
      ].join('\n'));
    } else {
      await context.sendActivity([
        `👋 Hi! I'm **RGMC IT Bot**.`,
        ``,
        `I couldn't automatically link your account (${result.message.replace(/^❌\s*/, '')}).`,
        `Type \`link\` to try again, \`subscribe me <username>\` to link a specific account, or \`help\` to see what I can do.`,
      ].join('\n'));
    }
  } catch (err) {
    console.error('autoLinkOnInstall failed:', (err as Error).message);
  }
}
