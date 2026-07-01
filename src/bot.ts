import { TeamsActivityHandler, TurnContext, MessageFactory } from 'botbuilder';
import { getTicketByNumber, findSystemsByTag } from './services/supabase';
import {
  registerChannel,
  unregisterChannel,
  subscribeChannel,
  configureFilters,
  getChannelStatus,
} from './services/channelService';
import { buildTicketStatusCard } from './cards/ticketCard';
import { buildSiteStatusCard } from './cards/siteStatusCard';
import { buildSiteInfoCard } from './cards/siteInfoCard';
import { buildHelpCard } from './cards/helpCard';
import { buildQueryResultCard } from './cards/queryResultCard';
import { askGpt } from './services/gptService';
import { pingSystem } from './services/pingService';
import { bigqueryByValue, bigqueryLatest, dbByValue, dbLatest, GcpAccessError, GcpNotFoundError } from './services/gcpService';
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

// Split long text into chunks without cutting mid-word, for Teams message limits
function chunkText(text: string, maxLen = 3800): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// Filler words stripped from "gumagana po ba yung <SITE>"
const GUMAGANA_FILLERS = new Set(['po', 'ba', 'yung']);

function gcpErrorMessage(err: unknown): string {
  if (err instanceof GcpNotFoundError)
    return `❌ Database not found. Valid names: sbic, tradeportal, travelandexpense, creative, accounting, production, masterfile`;
  if (err instanceof GcpAccessError)
    return `🔒 Access denied — ang SQL login ay walang permission sa database na yan. Kailangan ng DBA na mag-grant ng access.`;
  return `❌ GCP API error: ${(err as Error).message}`;
}

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

  // Strip optional Filipino query prefixes ("may pumasok ba ngayon sa" / "may pumasok ba sa")
  private static readonly QUERY_PREFIX = /^(may\s+pumasok\s+ba\s+ngayon\s+sa|may\s+pumasok\s+ba\s+sa)\s+/i;

  private async handleMessage(context: TurnContext): Promise<void> {
    const rawText = this.stripMention(context.activity.text || '').trim();
    const text    = rawText.replace(RgmcItBot.QUERY_PREFIX, '');
    const [command, ...args] = text.toLowerCase().split(/\s+/);
    // Original-case split — used for API params where case matters (values, names)
    const origArgs = text.split(/\s+/).slice(1);

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

      case 'subscribe': {
        const validEvents = new Set(['created', 'updated', 'resolved', 'all']);

        // Split args at the "department" keyword:
        // everything before it = event selectors; everything after it = dept name
        const deptIdx = args.indexOf('department');
        const eventArgs = deptIdx === -1 ? args : args.slice(0, deptIdx);
        const departmentFilter = deptIdx !== -1
          ? origArgs.slice(deptIdx + 1).join(' ').trim() || null
          : null;

        if (deptIdx !== -1 && !departmentFilter) {
          await context.sendActivity(pick([
            `Huy, ano ang department? 🤔 Kailangan mo ng department name pagkatapos ng \`department\`.\nExample: \`@RGMC IT Bot subscribe department IT\``,
            `Kulang! Lagyan mo ng department name. 😅\nExample: \`@RGMC IT Bot subscribe department Finance\``,
          ]));
          return;
        }

        const requestedEvents = eventArgs.filter(a => validEvents.has(a));

        if (eventArgs.length > 0 && requestedEvents.length === 0) {
          await context.sendActivity(pick([
            `Hmm, hindi ko kilala ang event na yan. 🤔 Valid options:\n• \`subscribe\` — new issues only\n• \`subscribe all\` — all ticket events\n• \`subscribe created updated resolved\` — mix and match\n• \`subscribe department <DEPT>\` — filter by department`,
            `Ay, mali ang event name. 😅 Gamitin:\n• \`subscribe\` — new issues only\n• \`subscribe all\` — lahat ng events\n• \`subscribe department IT\` — IT department lang`,
          ]));
          return;
        }

        const result = await subscribeChannel(context, requestedEvents, departmentFilter);
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
          const chunks = chunkText(answer);
          for (let i = 0; i < chunks.length; i++) {
            const label = chunks.length > 1 ? `*(${i + 1}/${chunks.length})*\n\n` : '';
            const msg = MessageFactory.text(label + chunks[i]);
            msg.textFormat = 'markdown';
            await context.sendActivity(msg);
          }
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
            `Gumagana... ano? 😅 Kailangan mo ng site name!\nExample: \`@RGMC IT Bot gumagana po ba yung portal?\``,
            `Uy, anung site ang tinatanong mo? 🤔 Di ko mahulaan!\nExample: \`@RGMC IT Bot gumagana po ba yung portal?\``,
            `"Gumagana po ba yung"... yung ano? 😂 Sabihin mo na kung aling site!\nExample: \`@RGMC IT Bot gumagana po ba yung portal?\``,
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
            `Anong site ng... ano? 😅 Kailangan mo ng system name!\nExample: \`@RGMC IT Bot anong site po yung creatives?\``,
            `Uy, anung system ang hinahanap mo? 🤔 Di ko mahulaan!\nExample: \`@RGMC IT Bot anong site po yung portal?\``,
            `"Anong site po yung"... yung ano? 😂 I-specify mo na!\nExample: \`@RGMC IT Bot anong site po yung portal?\``,
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

      case 'vibe': {
        if (args[0] !== 'check') {
          await context.sendActivity(pick([
            `Huh? 🤔 "vibe"... ano? Baka ibig mong sabihin ay \`vibe check\`?`,
            `Vibe... lang? 😅 I-complete mo — \`@RGMC IT Bot vibe check\`!`,
          ]));
          break;
        }
        await context.sendActivity(pick([
          `Nandito po! ✅ Buhay na buhay — walang error, walang drama. Laging handa para sa inyo! 💪`,
          `Vibe? A-OK po! 🤖 Bot is up, systems are running, at ako ay naka-duty 24/7. Anong kailangan mo?`,
          `Grabe, in-check mo pa ako? 😂 Eto o — very much alive and kicking! All systems go. 🚀`,
          `Solid! 💯 Online, responsive, at laging may gana. Hindi ako basta-basta mapapagod. 😎`,
          `Hoy, nandito pa rin ako! 👋 Di pa ako tinatanggal. Ready to serve, sir/ma'am! ✅`,
          `Vibe check: PASSED. 🟢 Bot pulse — strong. Supabase — connected. Ako — handa. Let's go! 💪`,
        ]));
        break;
      }

      case 'bigquery': {
        const isLatest = args[0] === 'latest';

        if (isLatest) {
          // bigquery latest <table_name> <date_column>
          const [, tableName, dateColumn] = origArgs;
          if (!tableName || !dateColumn) {
            await context.sendActivity(pick([
              `Para sa BigQuery latest, kailangan ko ng table name at date column.\nExample: \`@RGMC IT Bot bigquery latest my_table created_at\``,
              `Kulang ang args! Gamitin: \`@RGMC IT Bot bigquery latest <table> <date_column>\``,
            ]));
            return;
          }
          await context.sendActivities([{ type: 'typing' }]);
          try {
            const result = await bigqueryLatest(tableName, dateColumn);
            await context.sendActivity(MessageFactory.attachment(buildQueryResultCard(
              { source: 'bigquery', variant: 'latest', tableName, dateCol: dateColumn },
              result.rows,
            )));
          } catch (err) {
            await context.sendActivity(gcpErrorMessage(err));
          }
        } else {
          // bigquery <table_name> <column_name> <column_value>
          const [tableName, whereColumn, ...valueParts] = origArgs;
          const whereValue = valueParts.join(' ');
          if (!tableName || !whereColumn || !whereValue) {
            await context.sendActivity(pick([
              `Para sa BigQuery query, kailangan: table, column, at value.\nExample: \`@RGMC IT Bot bigquery my_table status active\``,
              `Kulang! Gamitin: \`@RGMC IT Bot bigquery <table> <column> <value>\``,
            ]));
            return;
          }
          await context.sendActivities([{ type: 'typing' }]);
          try {
            const result = await bigqueryByValue(tableName, whereColumn, whereValue);
            await context.sendActivity(MessageFactory.attachment(buildQueryResultCard(
              { source: 'bigquery', variant: 'value', tableName, filterCol: whereColumn, filterVal: whereValue },
              result.rows,
            )));
          } catch (err) {
            await context.sendActivity(gcpErrorMessage(err));
          }
        }
        break;
      }

      case 'help':
        await context.sendActivity(MessageFactory.attachment(buildHelpCard()));
        break;

      default: {
        // Any unknown command with enough args is treated as a generic DB query:
        // <db_name> <table> <col> <val>  →  /{db_name}/by_table/value
        // <db_name> latest <table> <datecol> [numrows]  →  /{db_name}/by_table/latest
        const dbName   = command;
        const isLatest = args[0] === 'latest';

        if (isLatest && origArgs.length >= 3) {
          const [, tableName, dateColumn, numRowsStr] = origArgs;
          const numberOfRows = numRowsStr ? parseInt(numRowsStr, 10) || 100 : 100;
          await context.sendActivities([{ type: 'typing' }]);
          try {
            const result = await dbLatest(dbName, tableName, dateColumn, numberOfRows);
            await context.sendActivity(MessageFactory.attachment(buildQueryResultCard(
              { source: dbName, variant: 'latest', tableName, dateCol: dateColumn, numRows: numberOfRows },
              result.rows,
            )));
          } catch (err) {
            await context.sendActivity(gcpErrorMessage(err));
          }
        } else if (!isLatest && origArgs.length >= 3) {
          const [tableName, whereColumn, ...valueParts] = origArgs;
          const whereValue = valueParts.join(' ');
          await context.sendActivities([{ type: 'typing' }]);
          try {
            const result = await dbByValue(dbName, tableName, whereColumn, whereValue);
            await context.sendActivity(MessageFactory.attachment(buildQueryResultCard(
              { source: dbName, variant: 'value', tableName, filterCol: whereColumn, filterVal: whereValue },
              result.rows,
            )));
          } catch (err) {
            await context.sendActivity(gcpErrorMessage(err));
          }
        } else {
          const unknownCmd = command || '(walang sinabi)';
          await context.sendActivity(pick([
            `Huh? 🤔 Hindi ko gets ang \`${unknownCmd}\`. Eto ang mga alam ko:`,
            `\`${unknownCmd}\`? Saang mundo galing yan? 😂 Hindi ko kilala yun. Eto ang commands ko:`,
            `Ay, hindi ako basta-basta — wala akong alam na \`${unknownCmd}\`. 😅 Baka ito ang hinahanap mo:`,
            `Hmmmm... \`${unknownCmd}\`... hindi sa akin yan. 🤷 Eto ang actual na commands ko:`,
          ]));
          await context.sendActivity(MessageFactory.attachment(buildHelpCard()));
        }
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
