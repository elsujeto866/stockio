/**
 * Unit tests for productPhotos storage module.
 *
 * PP-T8: buildPhotoPath deterministic path
 * PP-T9: uploadProductPhoto compression, upsert, replace-cleanup
 * PP-T10: deleteProductPhoto calls storage.remove
 *
 * Mocks: browser-image-compression + supabase.storage
 * NO real image processing, NO real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mock browser-image-compression BEFORE importing the module under test.
// ---------------------------------------------------------------------------
vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}));

import imageCompression from 'browser-image-compression';
import { buildPhotoPath, uploadProductPhoto, deleteProductPhoto } from '@/lib/storage/productPhotos';

// ---------------------------------------------------------------------------
// Storage mock factory
// ---------------------------------------------------------------------------
function makeStorageMock() {
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  const removeMock = vi.fn().mockResolvedValue({ error: null });
  const supabase = {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: uploadMock,
        remove: removeMock,
      }),
    },
  };
  return { supabase, uploadMock, removeMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default compression mock returns a minimal Blob
  (imageCompression as Mock).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
});

// ---------------------------------------------------------------------------
// PP-T8: buildPhotoPath
// ---------------------------------------------------------------------------
describe('buildPhotoPath', () => {
  it('returns {tenantId}/{productId}.jpg', () => {
    expect(buildPhotoPath('tenantA', 'prod-123')).toBe('tenantA/prod-123.jpg');
  });

  it('always uses .jpg extension regardless of input', () => {
    const path = buildPhotoPath('t', 'any-id');
    expect(path.endsWith('.jpg')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PP-T9: uploadProductPhoto
// ---------------------------------------------------------------------------
describe('uploadProductPhoto', () => {
  it('S2-1: calls imageCompression with correct options', async () => {
    const { supabase } = makeStorageMock();
    const file = new File(['data'], 'photo.png', { type: 'image/png' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadProductPhoto(supabase as any, {
      tenantId: 'tA',
      productId: 'p1',
      file,
    });

    expect(imageCompression).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        maxWidthOrHeight: 800,
        maxSizeMB: 0.2,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.7,
      })
    );
  });

  it('calls storage.upload with upsert:true and contentType image/jpeg', async () => {
    const { supabase, uploadMock } = makeStorageMock();
    const file = new File(['data'], 'photo.png', { type: 'image/png' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadProductPhoto(supabase as any, { tenantId: 'tA', productId: 'p1', file });

    expect(uploadMock).toHaveBeenCalledWith(
      'tA/p1.jpg',
      expect.any(Blob),
      { upsert: true, contentType: 'image/jpeg' }
    );
  });

  it('S1-3 same-path replace: remove NOT called when previousPath equals current path', async () => {
    const { supabase, removeMock } = makeStorageMock();
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadProductPhoto(supabase as any, {
      tenantId: 'tA',
      productId: 'p1',
      file,
      previousPath: 'tA/p1.jpg', // same as current path
    });

    expect(removeMock).not.toHaveBeenCalled();
  });

  it('legacy-ext cleanup: remove called when previousPath differs from current path', async () => {
    const { supabase, removeMock } = makeStorageMock();
    const file = new File(['data'], 'photo.png', { type: 'image/png' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadProductPhoto(supabase as any, {
      tenantId: 'tA',
      productId: 'p1',
      file,
      previousPath: 'tA/p1.png', // different extension — legacy path
    });

    expect(removeMock).toHaveBeenCalledWith(['tA/p1.png']);
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('no remove call when previousPath is null', async () => {
    const { supabase, removeMock } = makeStorageMock();
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadProductPhoto(supabase as any, {
      tenantId: 'tA',
      productId: 'p1',
      file,
      previousPath: null,
    });

    expect(removeMock).not.toHaveBeenCalled();
  });

  it('no remove call when previousPath is undefined', async () => {
    const { supabase, removeMock } = makeStorageMock();
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadProductPhoto(supabase as any, {
      tenantId: 'tA',
      productId: 'p1',
      file,
    });

    expect(removeMock).not.toHaveBeenCalled();
  });

  it('throws when storage.upload returns an error', async () => {
    const { supabase } = makeStorageMock();
    const uploadMock = vi.fn().mockResolvedValue({ error: new Error('upload failed') });
    supabase.storage.from = vi.fn().mockReturnValue({
      upload: uploadMock,
      remove: vi.fn(),
    });
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(uploadProductPhoto(supabase as any, { tenantId: 'tA', productId: 'p1', file })).rejects.toThrow();
  });

  it('returns the constructed path string', async () => {
    const { supabase } = makeStorageMock();
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await uploadProductPhoto(supabase as any, { tenantId: 'tA', productId: 'p1', file });

    expect(result).toBe('tA/p1.jpg');
  });
});

// ---------------------------------------------------------------------------
// PP-T10: deleteProductPhoto
// ---------------------------------------------------------------------------
describe('deleteProductPhoto', () => {
  it('calls storage.remove with the given path', async () => {
    const { supabase, removeMock } = makeStorageMock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteProductPhoto(supabase as any, 'tenantA/prod-123.jpg');

    expect(removeMock).toHaveBeenCalledWith(['tenantA/prod-123.jpg']);
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
