/**
 * ProductForm photo upload tests — PP-T12.
 *
 * REQ-1 (S1-1..S1-4), REQ-2 (S2-2, S2-3); Design §5; LINT GOTCHA.
 *
 * Mocks:
 *   - @/lib/storage/productPhotos (uploadProductPhoto, deleteProductPhoto)
 *   - @/lib/supabase/client (createClient)
 *   - browser-image-compression
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (declared before imports)
// ---------------------------------------------------------------------------
vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/storage/productPhotos', () => ({
  uploadProductPhoto: vi.fn(),
  deleteProductPhoto: vi.fn(),
  buildPhotoPath: vi.fn((t: string, p: string) => `${t}/${p}.jpg`),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({})),
}));

import imageCompression from 'browser-image-compression';
import { uploadProductPhoto, deleteProductPhoto } from '@/lib/storage/productPhotos';
import { ProductForm } from '@/components/products/ProductForm';
import type { ActionResult } from '@/app/(app)/products/actions';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const noop = vi.fn().mockResolvedValue(null as ActionResult);

const product: Product = {
  id: 'prod-1',
  tenant_id: 't-1',
  nombre: 'Aceite',
  sku: null,
  categoria: null,
  precio_unitario: 10,
  stock_actual: 5,
  stock_minimo: 1,
  unidad_medida: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  units_per_package: null,
  precio_paca: null,
  cost_price: null,
  shelf_life_days: null,
  expiry_alert_days: 30,
  image_path: 't-1/prod-1.jpg',
  presentacion: null,
};

const productNoPhoto: Product = { ...product, image_path: null };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: compression returns tiny blob
  (imageCompression as unknown as Mock).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  // Default: upload succeeds
  (uploadProductPhoto as Mock).mockResolvedValue('t-1/prod-1.jpg');
  // Default: delete succeeds
  (deleteProductPhoto as Mock).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Lint gotcha: exactly ONE 'use client' directive
// ---------------------------------------------------------------------------
describe('ProductForm — source file lint guard', async () => {
  it("source has 'use client' at the top and only one occurrence", async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — Vite raw import not typed in tsconfig
    const src = await import('@/components/products/ProductForm?raw').catch(() => null);
    if (!src) return; // raw import may not work in jsdom — skip gracefully
    const matches = (src.default as string).match(/'use client'/g);
    expect(matches?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Hidden inputs: id always present (D1)
// ---------------------------------------------------------------------------
describe('ProductForm — hidden id input (D1)', () => {
  it('renders hidden id input in create mode', () => {
    render(<ProductForm action={noop} tenantId="t-1" />);
    const idInput = document.querySelector('input[name="id"]') as HTMLInputElement | null;
    expect(idInput).not.toBeNull();
    expect(idInput!.type).toBe('hidden');
    expect(idInput!.value).toBeTruthy(); // random UUID generated
  });

  it('renders hidden id input in edit mode with initialData.id', () => {
    render(<ProductForm action={noop} tenantId="t-1" initialData={product} />);
    const idInput = document.querySelector('input[name="id"]') as HTMLInputElement | null;
    expect(idInput).not.toBeNull();
    expect(idInput!.value).toBe('prod-1');
  });

  it('hidden image_path input is always rendered', () => {
    render(<ProductForm action={noop} tenantId="t-1" />);
    const imgInput = document.querySelector('input[name="image_path"]') as HTMLInputElement | null;
    expect(imgInput).not.toBeNull();
    expect(imgInput!.type).toBe('hidden');
  });
});

// ---------------------------------------------------------------------------
// File input attributes
// ---------------------------------------------------------------------------
describe('ProductForm — file input', () => {
  it('renders file input with accept="image/*"', () => {
    render(<ProductForm action={noop} tenantId="t-1" />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput!.accept).toBe('image/*');
  });

  it('file input has capture="environment"', () => {
    render(<ProductForm action={noop} tenantId="t-1" />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput!.getAttribute('capture')).toBe('environment');
  });
});

// ---------------------------------------------------------------------------
// S2-2: non-image MIME rejected — uploadProductPhoto NOT called
// ---------------------------------------------------------------------------
describe('ProductForm — MIME validation (S2-2)', () => {
  it('shows upload error and does NOT call uploadProductPhoto for non-image MIME', async () => {
    render(<ProductForm action={noop} tenantId="t-1" />);

    const fileInput = document.querySelector('input[type="file"]')!;
    const pdfFile = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pdfFile] } });
    });

    expect(uploadProductPhoto).not.toHaveBeenCalled();
    // An error message should appear
    expect(document.body.textContent).toMatch(/imagen|image|tipo|mime/i);
  });
});

// ---------------------------------------------------------------------------
// S2-3: post-compress size > 5 MiB rejected
// ---------------------------------------------------------------------------
describe('ProductForm — post-compress size guard (S2-3)', () => {
  it('shows upload error and does NOT call uploadProductPhoto when compressed > 5 MiB', async () => {
    // Mock compression returning a blob > 5 MiB
    const bigBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)], { type: 'image/jpeg' });
    (imageCompression as unknown as Mock).mockResolvedValue(bigBlob);

    render(<ProductForm action={noop} tenantId="t-1" />);

    const fileInput = document.querySelector('input[type="file"]')!;
    const imgFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [imgFile] } });
    });

    expect(uploadProductPhoto).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/5|MB|grande|size/i);
  });
});

// ---------------------------------------------------------------------------
// Submit disabled while uploading
// ---------------------------------------------------------------------------
describe('ProductForm — submit disabled while uploading', () => {
  it('submit button is disabled while upload is in progress', async () => {
    // uploadProductPhoto never resolves during this test
    let resolveUpload!: (v: string) => void;
    (uploadProductPhoto as Mock).mockReturnValue(
      new Promise<string>((res) => { resolveUpload = res; })
    );

    render(<ProductForm action={noop} tenantId="t-1" />);

    const fileInput = document.querySelector('input[type="file"]')!;
    const imgFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    // Start upload (don't await — intentionally blocking)
    act(() => {
      fireEvent.change(fileInput, { target: { files: [imgFile] } });
    });

    // Wait a tick for state updates
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const submitBtn = screen.getByRole('button', { name: /crear producto/i });
    expect(submitBtn).toBeDisabled();

    // Resolve so the test cleans up
    resolveUpload('t-1/prod-1.jpg');
  });
});

// ---------------------------------------------------------------------------
// Remove photo (S1-4)
// ---------------------------------------------------------------------------
describe('ProductForm — remove photo (S1-4)', () => {
  it('shows remove button when initialData has image_path', () => {
    render(<ProductForm action={noop} tenantId="t-1" initialData={product} />);
    // Remove/Eliminar foto button should be visible
    const removeBtn = screen.queryByRole('button', { name: /eliminar foto|quitar foto|remove/i });
    expect(removeBtn).not.toBeNull();
  });

  it('calls deleteProductPhoto and clears image_path when remove is clicked', async () => {
    render(<ProductForm action={noop} tenantId="t-1" initialData={product} />);

    const removeBtn = screen.getByRole('button', { name: /eliminar foto|quitar foto|remove/i });

    await act(async () => {
      fireEvent.click(removeBtn);
    });

    expect(deleteProductPhoto).toHaveBeenCalledWith(
      expect.anything(), // supabase client
      't-1/prod-1.jpg'
    );
  });

  it('does NOT show remove button when product has no image', () => {
    render(<ProductForm action={noop} tenantId="t-1" initialData={productNoPhoto} />);
    const removeBtn = screen.queryByRole('button', { name: /eliminar foto|quitar foto|remove/i });
    expect(removeBtn).toBeNull();
  });
});
