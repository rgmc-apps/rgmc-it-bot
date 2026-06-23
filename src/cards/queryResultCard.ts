import { Attachment, CardFactory } from 'botbuilder';

const MAX_PREVIEW_ROWS = 5;
const MAX_PREVIEW_COLS = 5;
// Untruncated values can be large; keep well under Teams' ~28KB card limit
const MAX_TOTAL_ROWS = 15;

export type QuerySource  = string;
export type QueryVariant = 'value' | 'latest';

export interface QueryMeta {
  source:    QuerySource;
  variant:   QueryVariant;
  tableName: string;
  filterCol?: string;
  filterVal?: string;
  dateCol?:   string;
  numRows?:   number;
}

function strVal(val: unknown): string {
  return val == null ? '—' : String(val);
}

// Header row: accent-colored bold labels on a tinted background
function makeHeaderRow(cols: string[]) {
  return {
    type:    'Container',
    style:   'emphasis',
    spacing: 'None',
    separator: true,
    items: [{
      type:    'ColumnSet',
      spacing: 'None',
      columns: cols.map(c => ({
        type:  'Column',
        width: 'stretch',
        items: [{
          type:    'TextBlock',
          text:    c,
          weight:  'Bolder',
          size:    'Small',
          color:   'Accent',
          wrap:    true,
          spacing: 'None',
        }],
      })),
    }],
  };
}

// Data row: full values, wrap enabled, alternating zebra style
function makeDataRow(
  cols: string[],
  row: Record<string, unknown>,
  opts: { id?: string; hidden?: boolean; even?: boolean } = {},
) {
  const base: Record<string, unknown> = {
    type:    'Container',
    style:   opts.even ? 'default' : 'emphasis',
    spacing: 'None',
    items: [{
      type:    'ColumnSet',
      spacing: 'None',
      columns: cols.map(c => ({
        type:  'Column',
        width: 'stretch',
        items: [{
          type:    'TextBlock',
          text:    strVal(row[c]),
          size:    'Small',
          wrap:    true,       // full value — no truncation
          spacing: 'None',
        }],
      })),
    }],
  };
  if (opts.id !== undefined) base.id        = opts.id;
  if (opts.hidden)           base.isVisible  = false;
  return base;
}

export function buildQueryResultCard(
  meta: QueryMeta,
  rows: Record<string, unknown>[],
): Attachment {
  const sourceIcon   = meta.source === 'bigquery' ? '📊' : '🗄️';
  const sourceLabel  = meta.source.toUpperCase();
  const variantLabel = meta.variant === 'latest' ? 'LATEST' : 'BY VALUE';

  const filterText = meta.variant === 'value'
    ? `${meta.filterCol} = ${meta.filterVal}`
    : `date column: ${meta.dateCol}${meta.numRows ? ` · rows: ${meta.numRows}` : ''}`;

  const cappedRows = rows.slice(0, MAX_TOTAL_ROWS);
  const total      = rows.length;
  const shown      = cappedRows.length;

  // ── No-results card ────────────────────────────────────────────────────────
  if (total === 0) {
    return CardFactory.adaptiveCard({
      type: 'AdaptiveCard', version: '1.4',
      body: [
        {
          type: 'Container', style: 'emphasis', bleed: true,
          items: [
            { type: 'TextBlock', text: `${sourceIcon}  ${sourceLabel} · ${variantLabel}`, size: 'Small', weight: 'Bolder', color: 'Accent', spacing: 'None' },
            { type: 'TextBlock', text: meta.tableName, size: 'ExtraLarge', weight: 'Bolder', spacing: 'None', wrap: true },
            { type: 'TextBlock', text: filterText, size: 'Small', isSubtle: true, spacing: 'None', wrap: true },
          ],
        },
        {
          type: 'Container', style: 'warning', bleed: true, spacing: 'None',
          items: [{ type: 'TextBlock', text: '⚠️  No results found', size: 'Small', weight: 'Bolder', spacing: 'None' }],
        },
      ],
    });
  }

  // ── Derive columns ─────────────────────────────────────────────────────────
  const allCols     = Object.keys(cappedRows[0]);
  const previewCols = allCols.slice(0, MAX_PREVIEW_COLS);
  const extraCols   = allCols.length - previewCols.length;

  const visibleRows = cappedRows.slice(0, MAX_PREVIEW_ROWS);
  const hiddenRows  = cappedRows.slice(MAX_PREVIEW_ROWS);
  const hiddenIds   = hiddenRows.map((_, i) => `qr-row-${i}`);

  // ── Card body ──────────────────────────────────────────────────────────────
  const body: object[] = [
    // ── Header banner ────────────────────────────────────────────────────────
    {
      type: 'Container', style: 'emphasis', bleed: true,
      items: [
        {
          type: 'ColumnSet', spacing: 'None',
          columns: [
            {
              type: 'Column', width: 'stretch',
              items: [
                { type: 'TextBlock', text: `${sourceIcon}  ${sourceLabel} · ${variantLabel}`, size: 'Small', weight: 'Bolder', color: 'Accent', spacing: 'None' },
                { type: 'TextBlock', text: meta.tableName, size: 'Large', weight: 'Bolder', spacing: 'None', wrap: true },
                { type: 'TextBlock', text: filterText, size: 'Small', isSubtle: true, spacing: 'None', wrap: true },
              ],
            },
            {
              type: 'Column', width: 'auto', verticalContentAlignment: 'Center',
              items: [{
                type:    'TextBlock',
                text:    total > MAX_TOTAL_ROWS ? `${shown}/${total}` : `${total}`,
                size:    'ExtraLarge',
                weight:  'Bolder',
                color:   'Accent',
                spacing: 'None',
              }],
            },
          ],
        },
        // Rows label under count
        {
          type: 'TextBlock',
          text: total > MAX_TOTAL_ROWS
            ? `showing first ${shown} of ${total} rows`
            : `row${total !== 1 ? 's' : ''} found`,
          size: 'Small', isSubtle: true, spacing: 'None', horizontalAlignment: 'Right',
        },
      ],
    },

    // ── Table: column headers ─────────────────────────────────────────────────
    makeHeaderRow(previewCols),

    // ── Visible rows (always shown) ───────────────────────────────────────────
    ...visibleRows.map((r, i) => makeDataRow(previewCols, r, { even: i % 2 === 0 })),

    // ── Hidden rows (revealed by toggle) ─────────────────────────────────────
    ...hiddenRows.map((r, i) =>
      makeDataRow(previewCols, r, {
        id:     `qr-row-${i}`,
        hidden: true,
        even:   (visibleRows.length + i) % 2 === 0,
      })
    ),
  ];

  if (extraCols > 0) {
    body.push({
      type: 'TextBlock',
      text: `*+${extraCols} more column${extraCols !== 1 ? 's' : ''} not shown*`,
      size: 'Small', isSubtle: true, spacing: 'Small',
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const actions: object[] = [];
  if (hiddenIds.length > 0) {
    actions.push({
      type:           'Action.ToggleVisibility',
      title:          `▼ Show / Hide Remaining ${hiddenRows.length} Rows`,
      targetElements: hiddenIds,
    });
  }

  return CardFactory.adaptiveCard({
    type: 'AdaptiveCard', version: '1.4',
    body,
    actions,
  });
}
