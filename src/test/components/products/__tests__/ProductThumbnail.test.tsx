/**
 * Unit tests for ProductThumbnail component.
 *
 * PP-T16: REQ-5 (S5-1..S5-5), REQ-6 (S6-1..S6-5); Design D4, §7.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';

// ---------------------------------------------------------------------------
// next/image mock — renders a plain <img> in jsdom
// ---------------------------------------------------------------------------
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, unoptimized, className }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    unoptimized?: boolean;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} data-unoptimized={unoptimized} className={className} />
  ),
}));

describe('ProductThumbnail — null url (S6-1..S6-5)', () => {
  it('renders a placeholder div when url is null', () => {
    const { container } = render(<ProductThumbnail url={null} alt="test" />);
    const placeholder = container.querySelector('div[aria-hidden]');
    expect(placeholder).not.toBeNull();
  });

  it('does NOT render an <img> element when url is null', () => {
    render(<ProductThumbnail url={null} alt="test" />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('placeholder has fixed width and height equal to size prop', () => {
    const { container } = render(<ProductThumbnail url={null} alt="test" size={56} />);
    const placeholder = container.querySelector('div[aria-hidden]') as HTMLDivElement;
    expect(placeholder.style.width).toBe('56px');
    expect(placeholder.style.height).toBe('56px');
  });

  it('default size is 56 when size prop is omitted', () => {
    const { container } = render(<ProductThumbnail url={null} alt="test" />);
    const placeholder = container.querySelector('div[aria-hidden]') as HTMLDivElement;
    expect(placeholder.style.width).toBe('56px');
  });
});

describe('ProductThumbnail — with url (S5-1..S5-5)', () => {
  it('renders an <img> element when url is set', () => {
    render(<ProductThumbnail url="https://example.com/photo.jpg" alt="My product" />);
    expect(screen.getByRole('img')).not.toBeNull();
  });

  it('renders with unoptimized attribute (D4 — token-rotating signed URL)', () => {
    render(<ProductThumbnail url="https://example.com/photo.jpg" alt="test" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('data-unoptimized')).toBe('true');
  });

  it('forwards alt prop to the image', () => {
    render(<ProductThumbnail url="https://example.com/photo.jpg" alt="Widget photo" />);
    expect(screen.getByAltText('Widget photo')).not.toBeNull();
  });

  it('forwards size to width and height', () => {
    render(<ProductThumbnail url="https://example.com/photo.jpg" alt="test" size={40} />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('height')).toBe('40');
  });

  it('does NOT render a placeholder div when url is set', () => {
    const { container } = render(
      <ProductThumbnail url="https://example.com/photo.jpg" alt="test" />
    );
    expect(container.querySelector('div[aria-hidden]')).toBeNull();
  });
});

describe('ProductThumbnail — className forwarding', () => {
  it('forwards className to the placeholder', () => {
    const { container } = render(
      <ProductThumbnail url={null} alt="test" className="my-class" />
    );
    const placeholder = container.querySelector('div[aria-hidden]');
    expect(placeholder?.className).toContain('my-class');
  });

  it('forwards className to the image wrapper', () => {
    render(<ProductThumbnail url="https://x.com/img.jpg" alt="test" className="my-img-class" />);
    const img = screen.getByRole('img');
    expect(img.className).toContain('my-img-class');
  });
});
