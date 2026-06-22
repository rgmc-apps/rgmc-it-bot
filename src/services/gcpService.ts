import { config } from '../config';

export interface QueryResult {
  rows: Record<string, unknown>[];
}

async function gcpGet(path: string, params: Record<string, string | number>): Promise<QueryResult> {
  const base = config.gcpApiUrl;
  if (!base) throw new Error('GCP_API_URL is not configured');

  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string])
  ).toString();

  const res = await fetch(`${base}${path}?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GCP API error ${res.status}: ${body || res.statusText}`);
  }

  const data: unknown = await res.json();

  if (Array.isArray(data)) return { rows: data as Record<string, unknown>[] };

  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.rows)) return { rows: d.rows as Record<string, unknown>[] };
    if (Array.isArray(d.data)) return { rows: d.data as Record<string, unknown>[] };
  }

  return { rows: [] };
}

export function bigqueryByValue(tableName: string, whereColumn: string, whereValue: string) {
  return gcpGet('/bigquery_routes/by_table/value', {
    table_name: tableName,
    where_column: whereColumn,
    where_value: whereValue,
  });
}

export function bigqueryLatest(tableName: string, dateColumn: string) {
  return gcpGet('/bigquery_routes/by_table/latest', {
    table_name: tableName,
    date_column: dateColumn,
  });
}

export function sbicByValue(tableName: string, whereColumn: string, whereValue: string) {
  return gcpGet('/sbic/by_table/value', {
    table_name: tableName,
    where_column: whereColumn,
    where_value: whereValue,
  });
}

export function sbicLatest(tableName: string, dateColumn: string, numberOfRows = 100) {
  return gcpGet('/sbic/by_table/latest', {
    table_name: tableName,
    date_column: dateColumn,
    number_of_rows: numberOfRows,
  });
}
