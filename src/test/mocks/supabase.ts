/**
 * createMockSupabaseClient — typed mock factory for unit tests.
 *
 * Usage:
 *   const supabase = createMockSupabaseClient({ tables: { products: [...] } });
 *   const products = await getProducts(supabase);
 *
 * The mock follows the Supabase query-builder pattern just enough for the
 * data functions in src/lib/data/* to be unit-tested without a real DB.
 *
 * Supports:
 *   - .from('table').select(...).eq(...).order(...).limit(n)
 *   - .from('table').select(...).eq(...).single()
 *   - .from('table').insert(values).select(...).single()  ← captures payload
 *   - .from('table').update(values).eq(...).select(...).single()  ← captures payload
 *   - .rpc('fn', args)  → returns { data, error }
 *   - .auth.getUser()   → returns { data: { user } }
 *   - .auth.signInWithPassword()
 *   - .auth.signOut()
 *
 * Fixtures are keyed by table name. Each entry is an array of rows that the
 * mock will return for any .from('tableName') call in query mode.
 *
 * Mutation options (insertResult, updateResult, mutationError) apply to all
 * .insert() / .update() calls on this client instance.
 * mutationError is ONLY applied in mutation mode — SELECT queries are unaffected.
 *
 * Captured payloads are available via client.__captured after each call.
 */

export type MockRow = Record<string, unknown>;
export type MockTableData = Record<string, MockRow[]>;
export type MockRpcHandlers = Record<
  string,
  (args: Record<string, unknown>) => { data: unknown; error: null } | { data: null; error: { message: string; code: string } }
>;

/** Payloads captured from insert() and update() calls, for assertion in tests. */
export interface MockCapture {
  insertPayload: unknown;
  updatePayload: unknown;
}

export interface MockSupabaseOptions {
  /** Rows returned by .from() queries in query mode, keyed by table name. */
  tables?: MockTableData;
  /** Handler functions for .rpc() calls, keyed by function name. */
  rpcs?: MockRpcHandlers;
  /** The user returned by auth.getUser() and signInWithPassword(). */
  user?: { id: string; email: string } | null;
  /**
   * Row to return from .insert().select().single().
   * Falls back to the insert payload itself when not configured.
   */
  insertResult?: MockRow;
  /**
   * Row to return from .update().select().single().
   * Falls back to the update payload itself when not configured.
   */
  updateResult?: MockRow;
  /**
   * Error to resolve on any insert or update mutation.
   * Useful for simulating Postgres constraint violations (e.g., code '23514').
   * Does NOT affect SELECT queries.
   */
  mutationError?: { message: string; code: string };
}

/** Type of the client returned by createMockSupabaseClient. */
export type MockSupabaseClient = import('@supabase/supabase-js').SupabaseClient & {
  __captured: MockCapture;
};

// ---------------------------------------------------------------------------
// Internal query/mutation builder
// ---------------------------------------------------------------------------

interface MutationOpts {
  insertResult?: MockRow;
  updateResult?: MockRow;
  mutationError?: { message: string; code: string };
  captured: MockCapture;
}

function buildQueryResult(rows: MockRow[], mutationOpts: MutationOpts) {
  let _rows = [...rows];
  let _single = false;
  let _mutationKind: 'insert' | 'update' | null = null;
  let _mutationPayload: unknown = null;

  const builder = {
    select(_cols?: string) {
      return builder;
    },
    eq(col: string, value: unknown) {
      // Filter only in query mode; in mutation mode eq is informational
      if (_mutationKind === null) {
        _rows = _rows.filter((r) => r[col] === value);
      }
      return builder;
    },
    in(col: string, values: unknown[]) {
      if (_mutationKind === null) {
        _rows = _rows.filter((r) => values.includes(r[col]));
      }
      return builder;
    },
    neq(col: string, value: unknown) {
      if (_mutationKind === null) {
        _rows = _rows.filter((r) => r[col] !== value);
      }
      return builder;
    },
    order(_col: string, _opts?: unknown) {
      return builder;
    },
    limit(n: number) {
      if (_mutationKind === null) {
        _rows = _rows.slice(0, n);
      }
      return builder;
    },
    single() {
      _single = true;
      return builder;
    },
    insert(values: unknown) {
      mutationOpts.captured.insertPayload = values;
      _mutationKind = 'insert';
      _mutationPayload = values;
      return builder;
    },
    update(values: unknown) {
      mutationOpts.captured.updatePayload = values;
      _mutationKind = 'update';
      _mutationPayload = values;
      return builder;
    },
    delete() {
      // Intentional no-op — soft-delete goes through update(), not delete().
      return builder;
    },
    // Thenable: awaiting the builder resolves the query or mutation
    then(
      resolve: (result: {
        data: MockRow | MockRow[] | null;
        error: { message: string; code: string } | null;
      }) => void
    ) {
      if (_mutationKind !== null) {
        // Mutation mode
        if (mutationOpts.mutationError) {
          resolve({ data: null, error: mutationOpts.mutationError });
          return;
        }

        let result: MockRow | null;
        if (_mutationKind === 'insert') {
          const payload = Array.isArray(_mutationPayload)
            ? (_mutationPayload as MockRow[])[0]
            : (_mutationPayload as MockRow);
          result = mutationOpts.insertResult ?? payload ?? null;
        } else {
          result = mutationOpts.updateResult ?? (_mutationPayload as MockRow) ?? null;
        }

        if (_single) {
          resolve({ data: result, error: null });
        } else {
          resolve({ data: result !== null ? [result] : [], error: null });
        }
        return;
      }

      // Query mode
      if (_single) {
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

export function createMockSupabaseClient(options: MockSupabaseOptions = {}): MockSupabaseClient {
  const { tables = {}, rpcs = {}, user = null, insertResult, updateResult, mutationError } = options;

  const __captured: MockCapture = { insertPayload: undefined, updatePayload: undefined };

  const client = {
    from(tableName: string) {
      const rows = tables[tableName] ?? [];
      return buildQueryResult(rows, { insertResult, updateResult, mutationError, captured: __captured });
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

    __captured,
  };

  return client as unknown as MockSupabaseClient;
}
