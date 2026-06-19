import { TeamsActivityHandler, TurnContext, MessageFactory } from 'botbuilder';
import { getTicketByNumber, findSystemsByTag } from './services/supabase';
import {
  registerChannel,
  unregisterChannel,
  configureFilters,
  getChannelStatus,
} from './services/channelService';
import { buildTicketStatusCard } from './cards/ticketCard';
import { buildSiteStatusCard } from './cards/siteStatusCard';
import { buildSiteInfoCard } from './cards/siteInfoCard';
import { askGpt } from './services/gptService';
import { pingSystem } from './services/pingService';
import { PingResult } from './types';

// Picks a random item from an array so responses feel less robotic
function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

// Strip trailing question marks then leading filler words from args
function extractArg(args: string[], fillers: Set<string>): string {
  const remaining = [...args];
  while (remaining.length && fillers.has(remaining[0])) remaining.shift();
  return remaining.join(' ').trim().replace(/\?+$/, '');
}

const HELP_TEXT = `🤖 **RGMC IT Bot — Commands**

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

\`@RGMC IT Bot gumagana po ba yung <SITE>\`
  Check if a site is up (e.g. \`gumagana po ba yung payroll\`).

\`@RGMC IT Bot anong site po yung <SYSTEM>\`
  Get the URL(s) of a system (e.g. \`anong site po yung payroll\`).

\`@RGMC IT Bot help\`
  Show this message.`;

// Filler words stripped from "gumagana po ba yung <SITE>"
const GUMAGANA_FILLERS = new Set(['po', 'ba', 'yung']);

// Filler words stripped from "anong site po yung <SYSTEM>"
const ANONG_FILLERS = new Set(['site', 'po', 'yung']);

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
          await context.sendActivity(pick([
            `👋 Hoy hoy! Ako si **RGMC IT Bot** — ang pinaka-reliable na bot sa IT department! 🤖\n\nI-type mo ang \`@RGMC IT Bot help\` para makita ang lahat ng kaya ko.`,
            `👋 Uy, may bago! Welcome! Ako si **RGMC IT Bot**, laging nandito para sa inyo. 💪\n\nI-type mo ang \`@RGMC IT Bot help\` para sa listahan ng commands.`,
            `🤖 Nandito na ako! Ako si **RGMC IT Bot** — ticket watcher, site checker, at AI consultant sa iisang bot.\n\nType \`@RGMC IT Bot help\` para magsimula.`,
          ]));
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
          await context.sendActivity(pick([
            `Hoy, kulang ka! 😅 Kailangan mo ng registration code para dito.\nExample: \`@RGMC IT Bot register ABCD1234\``,
            `Register? Sige, pero... ano ang code? 🤔 Wala akong makitang code sa sinabi mo.\nExample: \`@RGMC IT Bot register ABCD1234\``,
            `Parang kumain ng walang kanin — register ng walang code. 😂 Subukan mo ulit:\n\`@RGMC IT Bot register ABCD1234\``,
          ]));
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
          await context.sendActivity(pick([
            `Anong ticket number yun? 🎫 Hindi ko mahulaan, pre. Example:\n\`@RGMC IT Bot ticket IT-0042\``,
            `Ticket... ano? 🤷 Kulang ka ng ticket number. Example:\n\`@RGMC IT Bot ticket IT-0042\``,
            `Ay nako, wala kang sinabi na ticket number. 😅 Kailangan ko yun!\nExample: \`@RGMC IT Bot ticket IT-0042\``,
          ]));
          return;
        }
        const ticket = await getTicketByNumber(ticketNumber);
        if (!ticket) {
          await context.sendActivity(pick([
            `Hm, hindi ko makita ang \`${ticketNumber}\`. 🔍 Baka mali ang number? O baka hindi pa na-encode?`,
            `Nasan na yung \`${ticketNumber}\`? 😅 Wala sa database. Double-check mo ang format (e.g. \`IT-0042\`).`,
            `\`${ticketNumber}\`? Hinanap ko na, wala talaga. 🤔 Sigurado kang tama ang ticket number?`,
          ]));
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
          await context.sendActivity(pick([
            `Mag-ask ka nga... ng ano? 😅 May tanong ka ba talaga?\nExample: \`@RGMC IT Bot ask Bakit mabagal ang PC ko?\``,
            `Huy, may tanong ka o wala? 🤔 Sabihin mo na!\nExample: \`@RGMC IT Bot ask How do I reset my password?\``,
            `Ask... na walang tanong. Classic. 😂 Subukan mo ulit:\n\`@RGMC IT Bot ask <tanong mo dito>\``,
          ]));
          return;
        }
        await context.sendActivities([{ type: 'typing' }]);
        try {
          const answer = await askGpt(question);
          const msg = MessageFactory.text(answer);
          msg.textFormat = 'markdown';
          await context.sendActivity(msg);
        } catch (err) {
          await context.sendActivity(pick([
            `Ay, hindi sumagot si AI ngayon. 😬 Baka busy siya. Try mo ulit mamaya!`,
            `Nag-error si ChatGPT. 🤖💥 Possible na may problema sa OpenAI. Try again in a bit!`,
            `Pasensya na, hindi ko nakuha ang sagot. 😅 Ganyan talaga pag may technical difficulties. Try ulit!`,
          ]));
        }
        break;
      }

      case 'gumagana': {
        const site = extractArg(args, GUMAGANA_FILLERS);

        if (!site) {
          await context.sendActivity(pick([
            `Gumagana... ano? 😅 Kailangan mo ng site name!\nExample: \`@RGMC IT Bot gumagana po ba yung payroll\``,
            `Uy, anung site ang tinatanong mo? 🤔 Di ko mahulaan!\nExample: \`@RGMC IT Bot gumagana po ba yung payroll\``,
            `"Gumagana po ba yung"... yung ano? 😂 Sabihin mo na kung aling site!\nExample: \`@RGMC IT Bot gumagana po ba yung payroll\``,
          ]));
          return;
        }

        await context.sendActivities([{ type: 'typing' }]);

        let systems;
        try {
          systems = await findSystemsByTag(site);
        } catch (err) {
          await context.sendActivity(pick([
            `Ay, hindi ko ma-access ang database ngayon. 😬 May problema sa Supabase. Try ulit mamaya!`,
            `Nag-error habang hinahanap ko ang systems. 😅 Baka may connectivity issue. Try again!`,
          ]));
          return;
        }

        if (systems.length === 0) {
          await context.sendActivity(pick([
            `Hm, wala akong nahanap na system na may tag na \`${site}\`. 🔍 Baka typo? O hindi pa na-tag sa systems table?`,
            `Hindi ko kilala ang \`${site}\`. 🤷 Wala sa aming listahan ng tags. Check the systems table!`,
            `\`${site}\`? First time ko marinig yan. 😅 Sigurado kang tama ang spelling? Check the tags column sa systems.`,
          ]));
          return;
        }

        const settled = await Promise.allSettled(
          systems.map(s => pingSystem(s.id))
        );

        const results: PingResult[] = settled.map((outcome, i) => {
          if (outcome.status === 'fulfilled') return outcome.value;
          return {
            id: systems[i].id,
            name: systems[i].name,
            status: 'down' as const,
            error: (outcome.reason as Error).message,
          };
        });

        await context.sendActivity(MessageFactory.attachment(buildSiteStatusCard(site, results)));
        break;
      }

      case 'anong': {
        const system = extractArg(args, ANONG_FILLERS);

        if (!system) {
          await context.sendActivity(pick([
            `Anong site ng... ano? 😅 Kailangan mo ng system name!\nExample: \`@RGMC IT Bot anong site po yung payroll\``,
            `Uy, anung system ang hinahanap mo? 🤔 Di ko mahulaan!\nExample: \`@RGMC IT Bot anong site po yung payroll\``,
            `"Anong site po yung"... yung ano? 😂 I-specify mo na!\nExample: \`@RGMC IT Bot anong site po yung payroll\``,
          ]));
          return;
        }

        await context.sendActivities([{ type: 'typing' }]);

        let systems;
        try {
          systems = await findSystemsByTag(system);
        } catch (err) {
          await context.sendActivity(pick([
            `Ay, hindi ko ma-access ang database ngayon. 😬 May problema sa Supabase. Try ulit mamaya!`,
            `Nag-error habang hinahanap ko ang systems. 😅 Baka may connectivity issue. Try again!`,
          ]));
          return;
        }

        if (systems.length === 0) {
          await context.sendActivity(pick([
            `Hm, wala akong nahanap na system na may tag na \`${system}\`. 🔍 Baka typo? O hindi pa na-tag sa systems table?`,
            `Hindi ko kilala ang \`${system}\`. 🤷 Wala sa aming listahan ng tags. Check the systems table!`,
            `\`${system}\`? First time ko marinig yan. 😅 Sigurado kang tama ang spelling? Check the tags column sa systems.`,
          ]));
          return;
        }

        await context.sendActivity(MessageFactory.attachment(buildSiteInfoCard(system, systems)));
        break;
      }

      case 'help':
        await context.sendActivity(HELP_TEXT);
        break;

      default: {
        const unknownCmd = command || '(walang sinabi)';
        await context.sendActivity(pick([
          `Huh? 🤔 Hindi ko gets ang \`${unknownCmd}\`. Eto ang mga alam ko:\n\n${HELP_TEXT}`,
          `\`${unknownCmd}\`? Saang mundo galing yan? 😂 Hindi ko kilala yun. Eto ang commands ko:\n\n${HELP_TEXT}`,
          `Ay, hindi ako basta-basta — wala akong alam na \`${unknownCmd}\`. 😅 Baka ito ang hinahanap mo:\n\n${HELP_TEXT}`,
          `Hmmmm... \`${unknownCmd}\`... hindi sa akin yan. 🤷 Eto ang actual na commands ko:\n\n${HELP_TEXT}`,
        ]));
        break;
      }
    }
  }

  private stripMention(text: string): string {
    return text
      .replace(/<at>[^<]*<\/at>/gi, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }
}
