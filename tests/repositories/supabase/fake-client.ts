/**
 * Minimal in-memory fake of the subset of the supabase-js query builder that
 * lib/repositories/supabase/index.ts actually calls. Exercises the real
 * repository classes against fake data instead of a live project, matching
 * the "test the code that ships" pattern used by tests/helpers/repositories.ts
 * for the IndexedDB backend.
 */

type Row = Record<string, unknown>;

/** Mimics the Postgres generated columns geom_geojson / point_origin_geojson. */
function withGeneratedGeojsonColumns(row: Row): Row {
  if (typeof row.geom === "string") {
    row.geom_geojson = JSON.parse(row.geom);
  }
  if ("point_origin" in row) {
    row.point_origin_geojson = row.point_origin ? JSON.parse(row.point_origin as string) : null;
  }
  return row;
}

class FakeQueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | null = null;
  private wantCount = false;

  constructor(
    private readonly table: Row[],
    private readonly onWrite: () => void,
  ) {}

  insert(payload: Row) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  select(_columns?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column: string, opts: { ascending: boolean }) {
    this.orderBy = { column, ascending: opts.ascending };
    return this;
  }

  private matched(): Row[] {
    return this.table.filter((row) => this.filters.every((f) => f(row)));
  }

  private applyOrder(rows: Row[]): Row[] {
    if (!this.orderBy) return rows;
    const { column, ascending } = this.orderBy;
    return [...rows].sort((a, b) => {
      const cmp = String(a[column]).localeCompare(String(b[column]));
      return ascending ? cmp : -cmp;
    });
  }

  private execute(): { data: Row[] | number | null; error: null; count: number | null } {
    if (this.mode === "insert") {
      const row = withGeneratedGeojsonColumns({ ...this.payload! });
      this.table.push(row);
      this.onWrite();
      return { data: [{ ...row }], error: null, count: null };
    }
    if (this.mode === "update") {
      const matched = this.matched();
      matched.forEach((row) => Object.assign(row, withGeneratedGeojsonColumns({ ...this.payload! })));
      this.onWrite();
      return { data: matched.map((r) => ({ ...r })), error: null, count: null };
    }
    if (this.mode === "delete") {
      const matched = this.matched();
      for (const row of matched) {
        const idx = this.table.indexOf(row);
        if (idx >= 0) this.table.splice(idx, 1);
      }
      this.onWrite();
      return { data: matched, error: null, count: null };
    }
    const rows = this.applyOrder(this.matched());
    if (this.wantCount) return { data: null, error: null, count: rows.length };
    return { data: rows.map((r) => ({ ...r })), error: null, count: null };
  }

  async maybeSingle() {
    const { data, error } = this.execute();
    const rows = data as Row[];
    return { data: rows[0] ?? null, error };
  }

  async single() {
    const { data, error } = this.execute();
    const rows = data as Row[];
    return { data: rows[0] ?? null, error };
  }

  then(resolve: (v: { data: Row[] | number | null; error: null; count: number | null }) => unknown) {
    return Promise.resolve(this.execute()).then(resolve);
  }
}

export function createFakeSupabaseClient() {
  const tables: Record<string, Row[]> = { projects: [], sites: [] };
  return {
    from(name: string) {
      if (!tables[name]) tables[name] = [];
      return new FakeQueryBuilder(tables[name], () => {}) as unknown as ReturnType<
        typeof createFakeSupabaseClient
      >["from"];
    },
    __tables: tables,
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}
