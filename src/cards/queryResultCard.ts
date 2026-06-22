import { Attachment, CardFactory } from 'botbuilder';

const MAX_PREVIEW_ROWS = 5;
const MAX_PREVIEW_COLS = 5;
const MAX_TOTAL_ROWS   = 200;

export type QuerySource  = 'bigquery' | 'sbic';
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

function cell(val: unknown, maxLen = 22): string {
  const s = val == null ? '—' : String(val);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

function colSet(cols: string[], row: Record<string, unknown>, id?: string, hidden = false) {
  return {
    type:      'ColumnSet',
    id,
    isVisible: !hidden,
    spacing:   'None' as const,
    columns: cols.map(c => ({
      type:  'Column',
      width: 'stretch',
      items: [{
        type:     'TextBlock',
        text:     cell(row[c]),
        size:     'Small',
        wrap:     false,
        isSubtle: true,
        spacing:  'None',
      }],
    })),
  };
}

function headerSet(cols: string[]) {
  return {
    type:    'ColumnSet',
    spacing: 'Small' as const,
    columns: cols.map(c => ({
      type:  'Column',
      width: 'stretch',
      items: [{
        type:    'TextBlock',
        text:    c,
        weight:  'Bolder',
        size:    'Small',
        color:   'Accent',
        wrap:    false,
        spacing: 'None',
      }],
    })),
  };
}

export function buildQueryResultCard(
  meta: QueryMeta,
  rows: Record<string, unknown>[],
): Attachment {
  const sourceIcon  = meta.source === 'bigquery' ? '📊' : '🗄️';
  const sourceLabel = meta.source === 'bigquery' ? 'BIGQUERY' : 'SBIC';
  const variantLabel = meta.variant === 'latest' ? 'LATEST' : 'BY VALUE';

  const filterText = meta.variant === 'value'
    ? `${meta.filterCol} = ${meta.filterVal}`
    : `date column: ${meta.dateCol}${meta.numRows ? ` · rows: ${meta.numRows}` : ''}`;

  const cappedRows = rows.slice(0, MAX_TOTAL_ROWS);
  const total = rows.length;
  const shown = cappedRows.length;

  // ── No-results card ────────────────────────────────────────────────────────
  if (total === 0) {
    return CardFactory.adaptiveCard({
      type: 'AdaptiveCard', version: '1.4',
      body: [
        {
          type: 'Container', style: 'emphasis', bleed: true,
          items: [
            { type: 'TextBlock', text: `${sourceIcon}  ${sourceLabel} · ${variantLabel}`, size: 'Small', weight: 'Bolder', color: 'Accent', spacing: 'None' },
            { type: 'TextBlock', text: meta.tableName, size: 'ExtraLarge', weight: 'Bolder', spacing: 'None', wrap: false },
            { type: 'TextBlock', text: filterText, size: 'Small', isSubtle: true, spacing: 'None' },
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
    // Header banner
    {
      type: 'Container', style: 'emphasis', bleed: true,
      items: [
        { type: 'TextBlock', text: `${sourceIcon}  ${sourceLabel} · ${variantLabel}`, size: 'Small', weight: 'Bolder', color: 'Accent', spacing: 'None' },
        { type: 'TextBlock', text: meta.tableName, size: 'ExtraLarge', weight: 'Bolder', spacing: 'None', wrap: false },
        { type: 'TextBlock', text: filterText, size: 'Small', isSubtle: true, spacing: 'None' },
      ],
    },
    // Row count strip
    {
      type: 'Container', style: 'good', bleed: true, spacing: 'None',
      items: [{
        type: 'TextBlock',
        text: total > MAX_TOTAL_ROWS
          ? `✅  ${total} rows found · showing first ${MAX_TOTAL_ROWS}`
          : `✅  ${total} row${total !== 1 ? 's' : ''} found`,
        size: 'Small', weight: 'Bolder', spacing: 'None',
      }],
    },
    // Column header
    headerSet(previewCols),
    { type: 'Separator' },
    // First MAX_PREVIEW_ROWS always visible
    ...visibleRows.map(r => colSet(previewCols, r)),
    // Remaining rows — hidden by default, revealed by toggle
    ...hiddenRows.map((r, i) => colSet(previewCols, r, `qr-row-${i}`, true)),
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
      title:          `▼ Show / Hide All ${shown} Rows`,
      targetElements: hiddenIds,
    });
  }

  return CardFactory.adaptiveCard({
    type: 'AdaptiveCard', version: '1.4',
    body,
    actions,
  });
}
