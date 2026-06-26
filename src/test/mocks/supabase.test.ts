/**
 * Unit tests for createMockSupabaseClient mutation extensions.
 *
 * Proves that insert()/update() now capture payloads and honor
 * mutationError for simulating Postgres constraint violations.
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';

// ---------------------------------------------------------------------------
// Capture — insert
// ---------------------------------------------------------------------------
describe('mock: insert capture', () => {
  it('captures the insert payload in __captured.insertPayload', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { id: 'new-id', nombre: 'Test' },
    });

    await supabase.from('products').insert({ nombre: 'Test', precio: 10 }).select('*').single();

    expect(supabase.__captured.insertPayload).toEqual({ nombre: 'Test', precio: 10 });
  });

  it('returns insertResult when configured', async () => {
    const expected = { id: 'gen-uuid', nombre: 'Widget', activo: true };
    const supabase = createMockSupabaseClient({ insertResult: expected });

    const { data, error } = await supabase
      .from('products')
      .insert({ nombre: 'Widget' })
      .select('*')
      .single();

    expect(error).toBeNull();
    expect(data).toEqual(expected);
  });

  it('falls back to the payload itself when insertResult is not configured', async () => {
    const payload = { nombre: 'Fallback', precio: 5 };
    const supabase = createMockSupabaseClient({});

    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select('*')
      .single();

    expect(error).toBeNull();
    expect(data).toEqual(payload);
  });

  it('resolves mutationError on insert when configured', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'check violation', code: '23514' },
    });

    const { data, error } = await supabase
      .from('products')
      .insert({ nombre: 'Test' })
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23514');
    expect(data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Capture — update
// ---------------------------------------------------------------------------
describe('mock: update capture', () => {
  it('captures the update payload in __captured.updatePayload', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [{ id: '1', nombre: 'Old' }] },
    });

    await supabase.from('products').update({ nombre: 'New' }).eq('id', '1');

    expect(supabase.__captured.updatePayload).toEqual({ nombre: 'New' });
  });

  it('returns updateResult when configured', async () => {
    const expected = { id: '1', nombre: 'Updated', activo: true };
    const supabase = createMockSupabaseClient({
      tables: { products: [{ id: '1', nombre: 'Old', activo: true }] },
      updateResult: expected,
    });

    const { data, error } = await supabase
      .from('products')
      .update({ nombre: 'Updated' })
      .eq('id', '1')
      .select('*')
      .single();

    expect(error).toBeNull();
    expect(data).toEqual(expected);
  });

  it('resolves mutationError on update when configured', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'check violation', code: '23514' },
    });

    const { data, error } = await supabase
      .from('products')
      .update({ stock_actual: -1 })
      .eq('id', '1')
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23514');
    expect(data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Isolation — mutationError does NOT affect SELECT queries
// ---------------------------------------------------------------------------
describe('mock: mutationError isolation', () => {
  it('does NOT apply mutationError to SELECT queries', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [{ id: '1', nombre: 'Widget' }] },
      mutationError: { message: 'check violation', code: '23514' },
    });

    // Pure select — must not be affected by mutationError
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', '1')
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ id: '1', nombre: 'Widget' });
  });

  it('applies mutationError only when insert or update is called', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [{ id: '1', nombre: 'Row' }] },
      mutationError: { message: 'constraint fail', code: '23514' },
    });

    // SELECT: no error
    const select = await supabase.from('products').select('*').eq('id', '1').single();
    expect(select.error).toBeNull();

    // UPDATE: error
    const update = await supabase.from('products').update({ nombre: 'X' }).eq('id', '1').select().single();
    expect(update.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility — existing select/query behaviour unchanged
// ---------------------------------------------------------------------------
describe('mock: select backward compatibility', () => {
  it('still filters rows with eq() in query mode', async () => {
    const supabase = createMockSupabaseClient({
      tables: {
        products: [
          { id: '1', activo: true },
          { id: '2', activo: false },
        ],
      },
    });

    const { data } = await supabase.from('products').select('*').eq('activo', true);
    expect(data).toHaveLength(1);
    expect((data as Array<{ id: string }>)[0].id).toBe('1');
  });

  it('still returns a single row with single()', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [{ id: 'x', nombre: 'X' }] },
    });

    const { data, error } = await supabase.from('products').select('*').single();
    expect(error).toBeNull();
    expect((data as { id: string }).id).toBe('x');
  });
});
