/**
 * createMockSupabaseClient — typed mock factory for unit tests.
 *
 * Usage:
 *   const supabase = createMockSupabaseClient({ from: { products: [...] } });
 *   const products = await getProducts(supabase);
 *
 * The mock follows the Supabase query-builder pattern just enough for the
 * data functions in src/lib/data/* to be unit-tested without a real DB.
 *
 * Supports:
 *   - .from('table').select(...).eq(...).order(...).limit(n)
 *   - .from('table').select(...).eq(...).single()
 *   - .from('table').insert(...).select(...).single()
 *   - .rpc('fn', args)  → returns { data, error }
 *   - .auth.getUser()   → returns { data: { user } }
 *   - .auth.signInWithPassword()
 *   - .auth.signOut()
 *
 * Fixtures are keyed by table name. Each entry is an array of rows that the
 * mock will return for any .from('tableName') call.
 */

export type MockRow = Record<string, unknown>;
export type MockTableData = Record<string, MockRow[]>;
export type MockRpcHandlers = Record<
  string,
  (args: Record<string, unknown>) => { data: unknown; error: null } | { data: null; error: { message: string; code: string } }
>;

export interface MockSupabaseOptions {
  /** Rows returned by .from() queries, keyed by table name. */
  tables?: MockTableData;
  /** Handler functions for .rpc() calls, keyed by function name. */
  rpcs?: MockRpcHandlers;
  /** The user returned by auth.getUser() and signInWithPassword(). */
  user?: { id: string; email: string } | null;
}

// ---------------------------------------------------------------------------
// Internal query builder
// ---------------------------------------------------------------------------

function buildQueryResult(rows: MockRow[]) {
  let _rows = [...rows];
  // _error is reserved for future mock error injection; const because we never reassign it here.
  const _error: { message: string; code: string } | null = null;
  let _single = false;

  const builder = {
    select(_cols?: string) {
      return builder;
    },
    eq(col: string, value: unknown) {
      _rows = _rows.filter((r) => r[col] === value);
      return builder;
    },
    in(col: string, values: unknown[]) {
      _rows = _rows.filter((r) => values.includes(r[col]));
      return builder;
    },
    neq(col: string, value: unknown) {
      _rows = _rows.filter((r) => r[col] !== value);
      return builder;
    },
    order(_col: string, _opts?: unknown) {
      return builder;
    },
    limit(n: number) {
      _rows = _rows.slice(0, n);
      return builder;
    },
    single() {
      _single = true;
      return builder;
    },
    insert(_values: unknown) {
      // Insert is a no-op in the mock; return builder for chaining
      return builder;
    },
    update(_values: unknown) {
      return builder;
    },
    delete() {
      return builder;
    },
    // Thenable: awaiting the builder resolves the query
    then(
      resolve: (result: {
        data: MockRow | MockRow[] | null;
        error: { message: string; code: string } | null;
      }) => void
    ) {
      if (_error) {
        resolve({ data: null, error: _error });
      } else if (_single) {
        resolve({ data: _rows[0] ?? null, error: null });
      } else {
        resolve({ data: _rows, error: null });
      }
    },
  };

  return builder;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMockSupabaseClient(options: MockSupabaseOptions = {}) {
  const { tables = {}, rpcs = {}, user = null } = options;

  return {
    from(tableName: string) {
      const rows = tables[tableName] ?? [];
      return buildQueryResult(rows);
    },

    async rpc(fnName: string, args: Record<string, unknown> = {}) {
      const handler = rpcs[fnName];
      if (!handler) {
        return {
          data: null,
          error: {
            message: `Mock RPC not found: ${fnName}`,
            code: 'MOCK_NOT_FOUND',
          },
        };
      }
      return handler(args);
    },

    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
      async signInWithPassword(_credentials: { email: string; password: string }) {
        return {
          data: { user, session: user ? { access_token: 'mock-token' } : null },
          error: user ? null : { message: 'Invalid credentials', code: 'invalid_credentials' },
        };
      },
      async signOut() {
        return { error: null };
      },
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}
