import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

type SQLInputValue = Parameters<DatabaseSync['prepare']>[0] extends never
  ? never
  : string | number | bigint | Buffer | null;

// Minimal supabase-js shape over node:sqlite. Only covers the query patterns
// used by server/src (see server/test/localPreview.test.ts).

export type DbErrorShape = {
  code?: string;
  message: string;
  details?: unknown;
  hint?: unknown;
};

export type PostgrestResult = {
  data: any;
  count: number | null;
  error: DbErrorShape | null;
};

type Filter = { sql: string; value: SQLInputValue };

type EmbedSpec = {
  key: string;           // property name on result rows
  table: string;         // joined table name
  alias: string;         // sql alias
  fkColumn: string;      // column on base table pointing to joined table id
  inner: boolean;
  fields: string[];
};

const EMBED_TABLE_FIELDS: Record<string, string> = {
  students: 'id, name, username, email, status, must_change_password',
  admin_profiles: 'id, name, email, status',
};

const EMBED_FK_BY_BASE: Record<string, Partial<Record<string, string>>> = {
  daily_reports: { students: 'student_id' },
  student_sessions: { students: 'student_id' },
  admin_audit_logs: {
    admin_profiles: 'actor_id',
    students: 'target_student_id',
  },
};

const JSON_COLUMNS: Record<string, string[]> = {
  admin_audit_logs: ['change_summary'],
};

const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const newToken = (): string => randomBytes(32).toString('base64url');

export const newId = (): string => randomUUID();

export const isoNow = (): string => new Date().toISOString();

const shapeError = (error: unknown): DbErrorShape => {
  const message = error instanceof Error ? error.message : String(error);
  if (/unique constraint|constraint failed/i.test(message)) {
    return { code: '23505', message };
  }
  return { code: '500', message };
};

const parseSelect = (select: string, baseTable: string): {
  columns: string[];
  embeds: EmbedSpec[];
} => {
  const trimmed = select.trim();
  if (!trimmed || trimmed === '*') return { columns: [], embeds: [] };

  // Split on top-level commas (ignore commas inside parens).
  const segments: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of trimmed) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      segments.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  segments.push(current);

  const columns: string[] = [];
  const embeds: EmbedSpec[] = [];
  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    const aliasedMatch = segment.match(
      /^([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_]*)(![A-Za-z_][A-Za-z0-9_]*)?\s*\(([^)]*)\)$/,
    );
    const simpleMatch = aliasedMatch
      ? null
      : segment.match(/^([A-Za-z_][A-Za-z0-9_]*)(!inner)?\s*\(([^)]*)\)$/);
    const embedMatch = aliasedMatch || simpleMatch;
    if (embedMatch) {
      const alias = aliasedMatch ? embedMatch[1] : null;
      const table = aliasedMatch ? embedMatch[2] : embedMatch[1];
      const fkHint = aliasedMatch ? embedMatch[3]?.slice(1) : null;
      const fields = (aliasedMatch ? embedMatch[4] : embedMatch[3])
        .split(',').map((item) => item.trim()).filter(Boolean);
      const resolvedFk = fkHint
        ? (Object.values(EMBED_FK_BY_BASE[baseTable] || {}).includes(fkHint)
          ? fkHint
          : undefined)
        : EMBED_FK_BY_BASE[baseTable]?.[table];
      const fkColumn = resolvedFk
        ?? Object.entries(EMBED_FK_BY_BASE[baseTable] || {}).find(([, column]) => column)?.[1];
      if (!fkColumn) {
        throw new Error(`Local shim cannot resolve embed "${segment}" from ${baseTable}`);
      }
      embeds.push({
        key: alias || table,
        table,
        alias: alias || table,
        fkColumn,
        inner: (aliasedMatch ? embedMatch[3] : embedMatch[2]) === '!inner',
        fields: fields.length
          ? fields
          : (EMBED_TABLE_FIELDS[table] || '').split(', ').filter(Boolean),
      });
      continue;
    }
    for (const column of segment.split(',')) {
      const name = column.trim();
      if (name) columns.push(name);
    }
  }
  return { columns: [...new Set(columns)], embeds };
};

const castIn = (table: string, column: string, value: unknown): SQLInputValue => {
  if (value === undefined || value === null) return null;
  if ((JSON_COLUMNS[table] || []).includes(column)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value) || isObject(value)) return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'bigint') return value;
  if (value instanceof Buffer) return value;
  return String(value);
};

const castOutRow = (table: string, columns: string[], row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const column of columns) {
    let value = row[column];
    if ((JSON_COLUMNS[table] || []).includes(column) && typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        /* keep raw string */
      }
    }
    out[column] = value;
  }
  return out;
};

type PendingWrite = {
  mode: 'insert' | 'update' | 'upsert' | 'delete';
  payload?: Record<string, unknown>;
  payloads?: Array<Record<string, unknown>>;
  conflict?: string[];
};

export class LocalQueryBuilder {
  private columns: string[] = [];
  private embeds: EmbedSpec[] = [];
  private filters: Filter[] = [];
  private orGroups: Filter[][] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitValue: number | null = null;
  private rangeValue: { from: number; to: number } | null = null;
  private countExact = false;
  private head = false;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';
  private write: PendingWrite | null = null;

  constructor(
    private db: DatabaseSync,
    private table: string,
  ) {}

  select(select = '*', options?: { count?: 'exact'; head?: boolean }): this {
    const parsed = parseSelect(select, this.table);
    this.columns = parsed.columns;
    this.embeds = parsed.embeds;
    this.countExact = options?.count === 'exact';
    this.head = options?.head === true;
    this.wantsEveryColumn = select.trim() === '*';
    return this;
  }

  private wantsEveryColumn = false;

  private tableColumnsCache: string[] | undefined;

  private tableColumns(): string[] {
    if (!this.tableColumnsCache) {
      const info = this.db.prepare(
        'select name from pragma_table_info(?)',
      ).all(this.table) as Array<{ name: string }>;
      this.tableColumnsCache = info.map((column) => column.name);
    }
    return this.tableColumnsCache;
  }

  // -- filters -------------------------------------------------------------

  private addFilter(column: string, op: string, value: unknown): this {
    const target = qualify(this.table, column);
    let sql: string;
    let param: SQLInputValue = null;
    switch (op) {
      case 'eq':
        if (value === null) {
          sql = `${target} is null`;
        } else {
          sql = `${target} = ?`;
          param = castScalar(value);
        }
        break;
      case 'neq':
        if (value === null) {
          sql = `${target} is not null`;
        } else {
          sql = `${target} <> ?`;
          param = castScalar(value);
        }
        break;
      case 'is':
        sql = `${target} is ?`;
        param = value === null ? null : castScalar(value);
        break;
      default:
        sql = `${target} ${op} ?`;
        param = castScalar(value);
    }
    this.filters.push({ sql, value: param });
    return this;
  }

  eq(column: string, value: unknown): this { return this.addFilter(column, 'eq', value); }
  neq(column: string, value: unknown): this { return this.addFilter(column, 'neq', value); }
  gt(column: string, value: unknown): this { return this.addFilter(column, '>', value); }
  gte(column: string, value: unknown): this { return this.addFilter(column, '>=', value); }
  lt(column: string, value: unknown): this { return this.addFilter(column, '<', value); }
  lte(column: string, value: unknown): this { return this.addFilter(column, '<=', value); }
  is(column: string, value: unknown): this { return this.addFilter(column, 'is', value); }

  like(column: string, pattern: string): this {
    const target = qualify(this.table, column);
    this.filters.push({ sql: `${target} like ? escape '\\'`, value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): this {
    const target = qualify(this.table, column);
    this.filters.push({
      sql: `lower(${target}) like lower(?) escape '\\'`,
      value: pattern,
    });
    return this;
  }

  or(expression: string): this {
    const group: Filter[] = [];
    for (const raw of expression.split(',')) {
      const clause = raw.trim();
      if (!clause) continue;
      const match = clause.match(
        /^([A-Za-z_][A-Za-z0-9_.]*)\.(ilike|like|eq|neq|gt|gte|lt|lte)\.(.*)$/,
      );
      if (!match) throw new Error(`Unsupported or() clause: ${clause}`);
      const [, column, op, rawValue] = match;
      const target = column.includes('.')
        ? `${quote(column.split('.')[0])}.${quote(column.split('.')[1])}`
        : qualify(this.table, column);
      let sql: string;
      switch (op) {
        case 'eq': sql = `${target} = ?`; break;
        case 'neq': sql = `${target} <> ?`; break;
        case 'ilike': sql = `lower(${target}) like lower(?) escape '\\'`; break;
        case 'like': sql = `${target} like ? escape '\\'`; break;
        default: sql = `${target} ${op} ?`;
      }
      group.push({ sql, value: rawValue });
    }
    this.orGroups.push(group);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeValue = { from, to };
    return this;
  }

  // -- writes ---------------------------------------------------------------

  insert(payload: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.write = {
      mode: 'insert',
      payloads: Array.isArray(payload) ? payload : [payload],
    };
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.write = { mode: 'update', payload };
    return this;
  }

  upsert(payload: Record<string, unknown>, options?: { onConflict?: string }): this {
    this.write = {
      mode: 'upsert',
      payload,
      conflict: options?.onConflict
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
    return this;
  }

  delete(): this {
    this.write = { mode: 'delete' };
    return this;
  }

  // -- terminal -------------------------------------------------------------

  async single(): Promise<PostgrestResult> {
    this.singleMode = 'single';
    return this.execute();
  }

  async maybeSingle(): Promise<PostgrestResult> {
    this.singleMode = 'maybe';
    return this.execute();
  }

  then<TResult1 = PostgrestResult, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  // -- internals ------------------------------------------------------------

  private async execute(): Promise<PostgrestResult> {
    return this.write ? this.executeWrite() : this.executeSelect();
  }

  private joinSql(): string {
    let sql = '';
    for (const embed of this.embeds) {
      const joinType = embed.inner ? 'inner join' : 'left join';
      sql += ` ${joinType} ${quote(embed.table)} as ${quote(embed.alias)}`
        + ` on ${quote(embed.alias)}.id = ${quote(this.table)}.${quote(embed.fkColumn)}`;
    }
    return sql;
  }

  private selectSql(): string {
    const parts: string[] = this.columns.length
      ? this.columns.map((column) => `${quote(this.table)}.${quote(column)}`)
      : this.embeds.length
        ? this.baseColumnStars()
        : ['*'];
    for (const embed of this.embeds) {
      for (const field of embed.fields) {
        parts.push(`${quote(embed.alias)}.${quote(field)} as ${quote(`${embed.key}__${field}`)}`);
      }
    }
    return parts.join(', ');
  }

  private baseColumnStars(): string[] {
    const result = this.db.prepare(
      `select group_concat(name) as cols from pragma_table_info(?)`,
    ).get(this.table) as { cols: string | null };
    const names = (result.cols || '').split(',');
    return names.map((name) => `${quote(this.table)}.${quote(name)}`);
  }

  private selectRows(): { rows: Array<Record<string, unknown>>; error: DbErrorShape | null } {
    const whereParts: string[] = [];
    const params: SQLInputValue[] = [];
    for (const filter of this.filters) {
      whereParts.push(filter.sql);
      if (filter.value !== undefined) params.push(filter.value);
    }
    for (const group of this.orGroups) {
      whereParts.push(`(${group.map((filter) => filter.sql).join(' or ')})`);
      for (const filter of group) {
        if (filter.value !== undefined) params.push(filter.value);
      }
    }
    let sql = `select ${this.selectSql()} from ${quote(this.table)}${this.joinSql()}`;
    if (whereParts.length) sql += ` where ${whereParts.join(' and ')}`;
    for (const entry of this.orders) {
      sql += ` order by ${qualify(this.table, entry.column)} ${entry.ascending ? 'asc' : 'desc'}`;
    }
    if (this.limitValue !== null) sql += ` limit ${Number(this.limitValue)}`;
    if (this.rangeValue) {
      const span = this.rangeValue.to - this.rangeValue.from + 1;
      if (this.limitValue === null) sql += ` limit ${span}`;
      sql += ` offset ${this.rangeValue.from}`;
    }
    try {
      const raw = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
      return { rows: raw.map((row) => this.materialize(row)), error: null };
    } catch (error) {
      return { rows: [], error: shapeError(error) };
    }
  }

  private materialize(raw: Record<string, unknown>): Record<string, unknown> {
    const baseColumns = this.columns.length
      ? this.columns
      : Object.keys(raw)
        .filter((key) => !key.includes('__'))
        .map((key) => key);
    const row = castOutRow(this.table, baseColumns, raw);
    for (const embed of this.embeds) {
      const embedded: Record<string, unknown> = {};
      let nonNullValue = false;
      let aliasSeen = false;
      for (const field of embed.fields) {
        const alias = `${embed.key}__${field}`;
        if (!(alias in raw)) continue;
        aliasSeen = true;
        let value = raw[alias];
        if (value !== null && value !== undefined) nonNullValue = true;
        if ((JSON_COLUMNS[embed.table] || []).includes(field) && typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            /* keep raw string */
          }
        }
        embedded[field] = value;
      }
      // Every alias NULL means the (left) join missed: no related row.
      if (!aliasSeen || !nonNullValue) {
        row[embed.key] = null;
        continue;
      }
      row[embed.key] = embedded;
    }
    return row;
  }

  private executeSelect(): PostgrestResult {
    const { rows, error } = this.selectRows();
    if (error) return { data: null, count: null, error };

    if (this.head) {
      return { data: null, count: this.countExact ? rows.length : null, error: null };
    }
    if (this.singleMode === 'single') {
      return rows.length
        ? { data: rows[0], count: null, error: null }
        : { data: null, count: null, error: { code: 'PGRST116', message: 'No rows found' } };
    }
    if (this.singleMode === 'maybe') {
      return { data: rows[0] ?? null, count: null, error: null };
    }
    return {
      data: rows,
      count: this.countExact ? this.countTotal() : null,
      error: null,
    };
  }

  private countTotal(): number {
    const whereParts: string[] = [];
    const params: SQLInputValue[] = [];
    for (const filter of this.filters) {
      whereParts.push(filter.sql);
      if (filter.value !== undefined) params.push(filter.value);
    }
    for (const group of this.orGroups) {
      whereParts.push(`(${group.map((filter) => filter.sql).join(' or ')})`);
      for (const filter of group) {
        if (filter.value !== undefined) params.push(filter.value);
      }
    }
    let sql = `select count(*) as total from ${quote(this.table)}${this.joinSql()}`;
    if (whereParts.length) sql += ` where ${whereParts.join(' and ')}`;
    const row = this.db.prepare(sql).get(...params) as { total: number };
    return row.total;
  }

  private whereForWrite(allowEmpty: boolean): { sql: string; params: SQLInputValue[] } {
    const parts: string[] = [];
    const params: SQLInputValue[] = [];
    for (const filter of this.filters) {
      parts.push(filter.sql);
      if (filter.value !== undefined) params.push(filter.value);
    }
    if (!parts.length && !allowEmpty) {
      throw new Error(`Refusing unfiltered ${this.write?.mode} on ${this.table}`);
    }
    return { sql: parts.length ? ` where ${parts.join(' and ')}` : '', params };
  }

  private executeWrite(): PostgrestResult {
    const write = this.write!;
    // SQLite `returning` only accepts plain column names: strip nested embeds
    // from the returning clause and re-read the affected rows afterwards.
    const wantsFullRow = !this.columns.length || this.wantsEveryColumn;
    const baseColumns = this.columns.length && !this.wantsEveryColumn
      ? this.columns.filter((column) => !column.includes('('))
      : this.tableColumns();
    const outColumns = wantsFullRow || this.columns.length ? baseColumns : null;
    const returning = baseColumns.length
      ? ` returning ${baseColumns.map((column) => quote(column)).join(', ')}`
      : '';
    try {
      if (write.mode === 'delete') {
        const where = this.whereForWrite(false);
        const rows = this.db.prepare(
          `delete from ${quote(this.table)}${where.sql}${returning || ' returning id'}`,
        ).all(...where.params) as Array<Record<string, unknown>>;
        const data = outColumns
          ? (this.singleMode === 'single' ? rows[0] ?? null : rows)
          : null;
        return { data, count: null, error: null };
      }
      if (write.mode === 'update') {
        const payload = write.payload || {};
        const keys = Object.keys(payload);
        if (!keys.length) throw new Error('Empty update payload');
        const assignments = keys.map((key) => `${quote(key)} = ?`).join(', ');
        const values: SQLInputValue[] = keys.map((key) => castIn(this.table, key, payload[key]));
        const where = this.whereForWrite(true);
        const rows = this.db.prepare(
          `update ${quote(this.table)} set ${assignments}${where.sql}${returning}`,
        ).all(...values, ...where.params) as Array<Record<string, unknown>>;
        if (!outColumns) return { data: null, count: null, error: null };
        const mapped = rows.map((row) => castOutRow(this.table, outColumns, row));
        const data = this.singleMode !== 'none' ? mapped[0] ?? null : mapped;
        return { data, count: null, error: null };
      }
      // insert / upsert
      const payloads = write.mode === 'upsert' ? [write.payload!] : write.payloads!;
      const rowsOut: Array<Record<string, unknown>> = [];
      for (const payload of payloads) {
        const row = { ...payload };
        // SQLite TEXT PRIMARY KEY does not auto-generate; mirror Postgres
        // `gen_random_uuid()` defaults for tables whose id the caller omitted.
        if (!Object.keys(row).includes('id') && this.hasTextIdPrimaryKey()) {
          row.id = newId();
        }
        const keys = Object.keys(row);
        if (!keys.length) throw new Error('Empty insert payload');
        const values: SQLInputValue[] = keys.map((key) => castIn(this.table, key, row[key]));
        const placeholders = keys.map(() => '?').join(', ');
        let conflictClause = '';
        if (write.mode === 'upsert') {
          const conflict = write.conflict?.length ? write.conflict : keys;
          const updateKeys = keys.filter((key) => !conflict.includes(key) && key !== 'id');
          const effective = updateKeys.length ? updateKeys : keys.filter((key) => key !== 'id');
          conflictClause = ` on conflict(${conflict.map(quote).join(', ')}) do update set ${effective
            .map((key) => `${quote(key)} = excluded.${quote(key)}`)
            .join(', ')}`;
        }
        const rows = this.db.prepare(
          `insert into ${quote(this.table)} (${keys.map(quote).join(', ')}) values (${placeholders})${conflictClause}${returning}`,
        ).all(...values) as Array<Record<string, unknown>>;
        // node:sqlite quirk: `returning` yields NULL ids on the ON CONFLICT DO
        // UPDATE branch, so re-read the row by its conflict key afterwards.
        const reRead = write.mode === 'upsert' && write.conflict?.length;
        if (reRead && rows.some((returned) => returned.id === null || returned.id === undefined)) {
          const conflictKeys: string[] = write.conflict!;
          const conflictValues = conflictKeys.map((key) => castIn(this.table, key, row[key]));
          const fresh = this.db.prepare(
            `select * from ${quote(this.table)} where ${conflictKeys
              .map((key) => `${quote(key)} = ?`).join(' and ')}`,
          ).all(...conflictValues) as Array<Record<string, unknown>>;
          rowsOut.push(fresh[0]);
          continue;
        }
        rowsOut.push(outColumns ? castOutRow(this.table, outColumns, rows[0]) : rows[0]);
      }
      if (!outColumns) return { data: null, count: null, error: null };
      const rowsWithEmbeds = rowsOut.map((row) => this.attachEmbedsToWrittenRow(row));
      const data = this.singleMode !== 'none' ? rowsWithEmbeds[0] ?? null : rowsWithEmbeds;
      return { data, count: null, error: null };
    } catch (error) {
      return { data: null, count: null, error: shapeError(error) };
    }
  }

  private hasTextIdPrimaryKey(): boolean {
    if (this.pkChecked === undefined) {
      const info = this.db.prepare(
        'select name, pk, type from pragma_table_info(?)',
      ).all(this.table) as Array<{ name: string; pk: number; type: string }>;
      const idColumn = info.find((column) => column.pk === 1);
      this.pkChecked = Boolean(idColumn && idColumn.name === 'id' && idColumn.type.toUpperCase() === 'TEXT');
    }
    return this.pkChecked;
  }

  private pkChecked: boolean | undefined;

  private attachEmbedsToWrittenRow(row: Record<string, unknown>): Record<string, unknown> {
    if (!this.embeds.length) return row;
    if (row.id === undefined || row.id === null) return row;
    const result: Record<string, unknown> = {};
    for (const column of this.columns.filter((column) => !column.includes('('))) {
      result[column] = row[column] === undefined ? null : row[column];
    }
    for (const embed of this.embeds) {
      let foreignKeySource = row[embed.fkColumn] ?? result[embed.fkColumn] ?? null;
      if (foreignKeySource === null && row.id !== null && row.id !== undefined) {
        const owner = this.db.prepare(
          `select ${quote(embed.fkColumn)} as fk from ${quote(this.table)} where id = ?`,
        ).get(row.id as SQLInputValue) as { fk: string | null } | undefined;
        foreignKeySource = owner?.fk ?? null;
      }
      const found = foreignKeySource === null
        ? undefined
        : this.db.prepare(
            `select ${embed.fields.map((field) => quote(field)).join(', ')}
             from ${quote(embed.table)} where id = ?`,
          ).get(foreignKeySource as SQLInputValue) as Record<string, unknown> | undefined;
      if (!found && embed.inner) {
        continue;
      }
      result[embed.key] = found || null;
    }
    return result;
  }
}

const castScalar = (value: unknown): SQLInputValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Buffer) return value;
  return JSON.stringify(value);
};

const qualify = (table: string, column: string): string => {
  if (column.includes('.')) {
    const [relation, field] = column.split('.', 2);
    return `${quote(relation)}.${quote(field)}`;
  }
  return `${quote(table)}.${quote(column)}`;
};

export type LocalAdminPrincipal = {
  id: string;
  email: string;
  name: string;
};

export const verifyLocalAdminToken = (
  db: DatabaseSync,
  token: string,
): LocalAdminPrincipal | null => {
  if (!token) return null;
  const row = db.prepare(`
    select p.id, p.email, p.name, s.expires_at
    from admin_sessions s
    join admin_profiles p on p.id = s.admin_id
    where s.token_hash = ?
  `).get(hashToken(token)) as
    | { id: string; email: string; name: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= isoNow()) return null;
  return { id: row.id, email: row.email, name: row.name };
};
export class LocalSupabaseClient {
  constructor(private db: DatabaseSync) {}

  from(table: string): LocalQueryBuilder {
    return new LocalQueryBuilder(this.db, table);
  }

  async rpc(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<PostgrestResult> {
    if (functionName === 'get_monthly_board') {
      return this.monthlyBoard({
        p_month_start: String(params.p_month_start),
        p_next_month_start: String(params.p_next_month_start),
        p_search: params.p_search === null || params.p_search === undefined
          ? null
          : String(params.p_search),
      });
    }
    return {
      data: null,
      count: null,
      error: { code: '42883', message: `Unknown local rpc: ${functionName}` },
    };
  }

  private monthlyBoard(params: {
    p_month_start: string;
    p_next_month_start: string;
    p_search: string | null;
  }): PostgrestResult {
    const monthStart = String(params.p_month_start);
    const nextStart = String(params.p_next_month_start);
    const search = params.p_search ? String(params.p_search).trim() : null;
    const searchClause = search ? ` and lower(s.name) like lower(?) escape '\\'` : '';
    const searchParams = search ? [`%${search}%`] : [];
    const period = 'r.report_date >= ? and r.report_date < ?';
    const evalCount = (evaluation: string) => `
      (select count(r.id) from daily_reports r
        where r.student_id = s.id and ${period}
          and r.self_evaluation = '${evaluation}'
      ) as ${evaluation}_count_`;
    const sql = `
      select
        s.id as student_id,
        s.name as student_name,
        coalesce((
          select json_group_array(
            json_object('date', r.report_date, 'report_id', r.id, 'self_evaluation', r.self_evaluation)
          ) from daily_reports r
          where r.student_id = s.id and r.report_date >= ? and r.report_date < ?
          order by r.report_date
        ), json_array()) as activities,
        (select count(r.id) from daily_reports r
          where r.student_id = s.id and r.report_date >= ? and r.report_date < ?
        ) as submitted_count,
        (select count(r.id) from daily_reports r
          where r.student_id = s.id and r.report_date >= ? and r.report_date < ?
            and r.self_evaluation = 'satisfied'
        ) as satisfied_count,
        (select count(r.id) from daily_reports r
          where r.student_id = s.id and r.report_date >= ? and r.report_date < ?
            and r.self_evaluation = 'average'
        ) as average_count,
        (select count(r.id) from daily_reports r
          where r.student_id = s.id and r.report_date >= ? and r.report_date < ?
            and r.self_evaluation = 'dissatisfied'
        ) as dissatisfied_count,
        (select count(r.id) from daily_reports r
          where r.student_id = s.id and r.report_date >= ? and r.report_date < ?
            and r.self_evaluation = 'other'
        ) as other_count
      from students s
      where s.status = 'active'${searchClause}
      order by s.name, s.id
    `;
    try {
      const rows = this.db.prepare(sql).all(
        monthStart, nextStart,
        monthStart, nextStart,
        monthStart, nextStart,
        monthStart, nextStart,
        monthStart, nextStart,
        monthStart, nextStart,
        ...(search ? [`%${search}%`] : []),
      ) as Array<Record<string, unknown>>;
      const data = rows.map((row) => ({
        student_id: row.student_id,
        student_name: row.student_name,
        activities: JSON.parse(String(row.activities || '[]')),
        submitted_count: Number(row.submitted_count),
        satisfied_count: Number(row.satisfied_count),
        average_count: Number(row.average_count),
        dissatisfied_count: Number(row.dissatisfied_count),
        other_count: Number(row.other_count),
      }));
      return { data, count: null, error: null };
    } catch (error) {
      return { data: null, count: null, error: shapeError(error) };
    }
  }

  auth = {
    getUser: async (token: string) => {
      const principal = verifyLocalAdminToken(this.db, token);
      if (!principal) {
        return {
          data: { user: null },
          error: { code: '401', message: 'invalid local admin token' },
        };
      }
      return {
        data: { user: { id: principal.id, email: principal.email } },
        error: null,
      };
    },
  };
}
