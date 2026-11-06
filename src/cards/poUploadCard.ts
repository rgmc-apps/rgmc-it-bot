import { Attachment, CardFactory } from 'botbuilder';
import { BcRetriggerPayload, PoUploadBatchPayload, PoUploadOrderResult, PoUploadUnmatchedPayload } from '../types';
import { config } from '../config';

type ContainerStyle = 'default' | 'emphasis' | 'good' | 'attention' | 'warning';

const MAX_ROWS = 5;

const TIER_ICON: Record<string, string> = {
  customer_branch_match: '🎯',
  branch_override: '📌',
  customer_override: '📌',
  automatic_ship_to_match: '🔎',
};

function tierIcon(tier: string | null): string {
  return (tier && TIER_ICON[tier]) || '•';
}

function reconcileAction() {
  if (!config.reconcilePageUrl) return null;
  return {
    type:  'Action.OpenUrl',
    title: '🗂️  Open /reconcile',
    style: 'positive',
    url:   config.reconcilePageUrl,
  };
}

function orderRow(r: PoUploadOrderResult): string {
  const tag = r.from_buffer ? '  _(retried)_' : '';
  return `${tierIcon(r.resolution_tier)} \`${r.po_ref}\` → **${r.order_no}** — ${r.customer_name}${r.branch_name ? ` / ${r.branch_name}` : ''}${tag}`;
}

function truncatedList(lines: string[], max = MAX_ROWS): string[] {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max), `_...and ${lines.length - max} more_`];
}

// ── Batch result (mirrors _send_batch_notification's email) ───────────────────

export function buildPoUploadBatchCard(payload: PoUploadBatchPayload): Attachment {
  const { label, company, successes, errors } = payload;
  const hasSuccesses = successes.length > 0;
  const hasErrors = errors.length > 0;

  const style: ContainerStyle = hasSuccesses && !hasErrors ? 'good' : !hasSuccesses && hasErrors ? 'attention' : 'warning';
  const totalCreated = successes.reduce((n, r) => n + r.lines_created, 0);
  const totalSkipped = successes.reduce((n, r) => n + r.lines_skipped, 0);

  const tierCounts: Record<string, number> = {};
  for (const r of successes) {
    const key = r.resolution_tier || 'unresolved';
    tierCounts[key] = (tierCounts[key] || 0) + 1;
  }
  const tierSummary = Object.entries(tierCounts)
    .map(([tier, n]) => `${tierIcon(tier === 'unresolved' ? null : tier)} ${n}`)
    .join('   ');

  // IMS (MSSQL) status, reported separately from the Business Central section below —
  // undefined/null mssql_inserted (e.g. a buffered retry with no MSSQL-insert data
  // recorded) is "unknown," excluded from both buckets rather than miscounted.
  const allResults: { po_ref: string; mssql_inserted?: boolean | null }[] = [...successes, ...errors];
  const imsInserted = allResults.filter(r => r.mssql_inserted === true);
  const imsNotInserted = allResults.filter(r => r.mssql_inserted === false);

  const body: object[] = [
    {
      type:  'Container',
      style,
      bleed: true,
      items: [
        {
          type:    'TextBlock',
          text:    '📦  POUL SO IMPORT',
          size:    'Small',
          weight:  'Bolder',
          spacing: 'None',
        },
        {
          type:    'TextBlock',
          text:    label,
          size:    'Large',
          weight:  'Bolder',
          spacing: 'None',
          wrap:    true,
        },
        {
          type:     'TextBlock',
          text:     `${company}  •  ${successes.length} created, ${errors.length} buffered`,
          size:     'Small',
          isSubtle: true,
          spacing:  'None',
        },
      ],
    },
    {
      type:    'ColumnSet',
      spacing: 'Medium',
      columns: [
        { type: 'Column', width: 'auto', items: [
          { type: 'TextBlock', text: 'LINES IN', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
          { type: 'TextBlock', text: `${totalCreated}`, size: 'Medium', weight: 'Bolder', spacing: 'None' },
        ] },
        { type: 'Column', width: 'auto', items: [
          { type: 'TextBlock', text: 'SKIPPED', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
          { type: 'TextBlock', text: `${totalSkipped}`, size: 'Medium', weight: 'Bolder', spacing: 'None' },
        ] },
        ...(tierSummary ? [{ type: 'Column', width: 'stretch', verticalContentAlignment: 'Center', items: [
          { type: 'TextBlock', text: 'RESOLVED VIA', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'None' },
          { type: 'TextBlock', text: tierSummary, size: 'Small', spacing: 'None' },
        ] }] : []),
      ],
    },
  ];

  if (imsInserted.length || imsNotInserted.length) {
    body.push(
      { type: 'TextBlock', text: '💾 IMS (MSSQL)', size: 'Small', weight: 'Bolder', color: 'accent', spacing: 'Medium', separator: true },
      {
        type: 'TextBlock',
        text: `✅ Inserted: ${imsInserted.length}    ⚠️ Not inserted: ${imsNotInserted.length}`,
        size: 'Small', spacing: 'Small',
      },
    );
    if (imsNotInserted.length) {
      body.push({
        type: 'TextBlock',
        text: truncatedList(imsNotInserted.map(r => `⚠️ \`${r.po_ref}\``)).join('\n\n'),
        wrap: true, size: 'Small', spacing: 'Small',
      });
    }
  }

  if (hasSuccesses) {
    body.push(
      { type: 'TextBlock', text: '✅ CREATED (Business Central)', size: 'Small', weight: 'Bolder', color: 'good', spacing: 'Medium', separator: true },
      { type: 'TextBlock', text: truncatedList(successes.map(orderRow)).join('\n\n'), wrap: true, size: 'Small', spacing: 'Small' },
    );
  }

  if (hasErrors) {
    const errorLines = errors.map(e => {
      const reason = e.error.length > 100 ? e.error.slice(0, 100) + '…' : e.error;
      return `🗂️ \`${e.po_ref}\` — ${reason}`;
    });
    body.push(
      { type: 'TextBlock', text: '🗂️ BUFFERED (Business Central — needs /reconcile)', size: 'Small', weight: 'Bolder', color: 'attention', spacing: 'Medium', separator: true },
      { type: 'TextBlock', text: truncatedList(errorLines).join('\n\n'), wrap: true, size: 'Small', spacing: 'Small' },
    );
  }

  const action = hasErrors ? reconcileAction() : null;

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body,
    actions: action ? [action] : [],
  };

  return CardFactory.adaptiveCard(card);
}

// ── Unmatched items (mirrors _send_unmatched_items_notification's email) ──────

export function buildPoUploadUnmatchedCard(payload: PoUploadUnmatchedPayload): Attachment {
  const { label, company, flagged } = payload;
  const totalUnmatched = flagged.reduce((n, r) => n + (r.unmatched_items?.length || 0), 0);

  const rows = flagged.map(r => {
    const items = (r.unmatched_items || []).slice(0, 3)
      .map(it => it.reason === 'no_item_reference' ? '(no item reference)' : (it.sku || '(blank SKU)'))
      .join(', ');
    const more = (r.unmatched_items?.length || 0) > 3 ? `, +${(r.unmatched_items!.length) - 3} more` : '';
    return `\`${r.po_ref}\` → **${r.order_no}** — ${r.customer_name}\n_Unmatched: ${items}${more}_`;
  });

  const body: object[] = [
    {
      type:  'Container',
      style: 'warning' as ContainerStyle,
      bleed: true,
      items: [
        { type: 'TextBlock', text: '📦  POUL SO IMPORT', size: 'Small', weight: 'Bolder', spacing: 'None' },
        { type: 'TextBlock', text: `${label} — unmatched items`, size: 'Large', weight: 'Bolder', spacing: 'None', wrap: true },
        {
          type:     'TextBlock',
          text:     `${company}  •  ${flagged.length} order(s), ${totalUnmatched} unmatched line(s)`,
          size:     'Small',
          isSubtle: true,
          spacing:  'None',
        },
      ],
    },
    { type: 'TextBlock', text: truncatedList(rows).join('\n\n'), wrap: true, size: 'Small', spacing: 'Medium' },
  ];

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body,
    actions: [],
  };

  return CardFactory.adaptiveCard(card);
}

// ── BC-only retrigger result (bot_notify.notify_bc_retrigger) ─────────────────
// summary is whichever of _run_sync_from_cloudsql's or _run_backfill_from_cloudsql's
// own summary dict was sent — only the keys that happen to be present are shown.

const SUMMARY_LABELS: Record<string, string> = {
  orders_synced: 'Checked',
  orders_not_found: 'Not found in BC',
  orders_errored: 'Errored',
  orders_created: 'Created',
  orders_failed: 'Failed',
  orders_skipped_existing: 'Already in BC',
  lines_created: 'Lines added',
  lines_skipped: 'Lines skipped',
  unmatched_items: 'Unmatched items',
};

export function buildBcRetriggerCard(payload: BcRetriggerPayload): Attachment {
  const { label, companies, po_ref_numbers, summary, requested_by } = payload;
  const hasFailure = (summary.orders_errored || summary.orders_failed || 0) > 0;
  const style: ContainerStyle = hasFailure ? 'warning' : 'good';

  const summaryText = Object.entries(summary)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${SUMMARY_LABELS[k] || k}: ${v}`)
    .join('   •   ');

  const requesterText = requested_by?.name
    ? `Requested by ${requested_by.name}${requested_by.department ? ` (${requested_by.department})` : ''}`
    : null;

  const body: object[] = [
    {
      type:  'Container',
      style,
      bleed: true,
      items: [
        { type: 'TextBlock', text: '🔁  RETRIGGER BC ONLY', size: 'Small', weight: 'Bolder', spacing: 'None' },
        { type: 'TextBlock', text: label, size: 'Large', weight: 'Bolder', spacing: 'None', wrap: true },
        {
          type:     'TextBlock',
          text:     `${companies.join(', ')}  •  ${po_ref_numbers.length} PO(s) checked`,
          size:     'Small',
          isSubtle: true,
          spacing:  'None',
        },
      ],
    },
    { type: 'TextBlock', text: summaryText, wrap: true, size: 'Small', spacing: 'Medium' },
    { type: 'TextBlock', text: truncatedList(po_ref_numbers.map(r => `\`${r}\``)).join(', '), wrap: true, size: 'Small', isSubtle: true, spacing: 'Small' },
    ...(requesterText ? [{ type: 'TextBlock', text: requesterText, size: 'Small', isSubtle: true, spacing: 'Small' }] : []),
  ];

  const card = {
    type:    'AdaptiveCard',
    version: '1.4',
    body,
    actions: [],
  };

  return CardFactory.adaptiveCard(card);
}
