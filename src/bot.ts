import { TeamsActivityHandler, TurnContext, MessageFactory } from 'botbuilder';
import { getTicketByNumber } from './services/supabase';
import {
  registerChannel,
  unregisterChannel,
  configureFilters,
  getChannelStatus,
} from './services/channelService';
import { buildTicketStatusCard } from './cards/ticketCard';
import { askGpt } from './services/gptService';

const HELP_TEXT = `**RGMC IT Bot — Commands**

\`@RGMC IT Bot register <CODE>\`
  Register this channel to receive ticket notifications.

\`@RGMC IT Bot unregister\`
  Stop receiving ticket notifications in this channel.

\`@RGMC IT Bot ticket <TICKET-NUMBER>\`
  Look up the status of a specific ticket (e.g. \`ticket IT-0042\`).

\`@RGMC IT Bot configure all\`
  Reset filters — receive notifications for all tickets.

\`@RGMC IT Bot configure priority high critical\`
  Only receive notifications for high/critical priority tickets.

\`@RGMC IT Bot configure type incident service_request\`
  Only receive notifications for specific ticket types.

\`@RGMC IT Bot status\`
  Show the notification configuration for this channel.

\`@RGMC IT Bot ask <QUESTION>\`
  Ask anything — your question will be answered by AI.

\`@RGMC IT Bot help\`
  Show this message.`;

export class RgmcItBot extends TeamsActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded || []) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(
            `👋 Hi! I'm the **RGMC IT Bot**. I send ticket notifications to Teams channels.\n\nType \`@RGMC IT Bot help\` to see available commands.`
          );
        }
      }
      await next();
    });
  }

  private async handleMessage(context: TurnContext): Promise<void> {
    const text = this.stripMention(context.activity.text || '').trim();
    const [command, ...args] = text.toLowerCase().split(/\s+/);

    switch (command) {
      case 'register': {
        const code = args[0];
        if (!code) {
          await context.sendActivity('❌ Please provide a registration code. Example:\n`@RGMC IT Bot register ABCD1234`');
          return;
        }
        const result = await registerChannel(context, code);
        await context.sendActivity(result.message);
        break;
      }

      case 'unregister': {
        const result = await unregisterChannel(context);
        await context.sendActivity(result.message);
        break;
      }

      case 'ticket': {
        const ticketNumber = args.join(' ').trim().toUpperCase();
        if (!ticketNumber) {
          await context.sendActivity('❌ Please provide a ticket number. Example:\n`@RGMC IT Bot ticket IT-0042`');
          return;
        }
        const ticket = await getTicketByNumber(ticketNumber);
        if (!ticket) {
          await context.sendActivity(`❌ No ticket found with number \`${ticketNumber}\`. Make sure to include the full ticket number (e.g. \`IT-0042\`).`);
          return;
        }
        await context.sendActivity(MessageFactory.attachment(buildTicketStatusCard(ticket)));
        break;
      }

      case 'configure': {
        const result = await configureFilters(context, args);
        await context.sendActivity(result.message);
        break;
      }

      case 'status': {
        const statusMessage = await getChannelStatus(context);
        await context.sendActivity(statusMessage);
        break;
      }

      case 'ask': {
        const question = args.join(' ').trim();
        if (!question) {
          await context.sendActivity('❌ Please provide a question. Example:\n`@RGMC IT Bot ask How do I reset my password?`');
          return;
        }
        await context.sendActivities([{ type: 'typing' }]);
        try {
          const answer = await askGpt(question);
          const msg = MessageFactory.text(answer);
          msg.textFormat = 'markdown';
          await context.sendActivity(msg);
        } catch (err) {
          await context.sendActivity(`❌ Failed to get a response: ${(err as Error).message}`);
        }
        break;
      }

      case 'help':
      default:
        await context.sendActivity(HELP_TEXT);
        break;
    }
  }

  private stripMention(text: string): string {
    return text
      .replace(/<at>[^<]*<\/at>/gi, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }
}
