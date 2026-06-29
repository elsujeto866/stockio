/**
 * ProductThumbnail — shared RSC component for product photo display.
 *
 * PP-T17: REQ-5, REQ-6; Design D4, §7.
 *
 * - url=null → fixed-size neutral placeholder (no <img> = no broken image, no console error)
 * - url set → next/image with unoptimized (D4: signed URLs have rotating ?token=;
 *   optimizer cache thrashes hourly; bytes already client-compressed at upload time)
 *
 * Reused by: ProductCard, product detail page, OrderBuilder line rows, PurchaseBuilder line rows.
 */

import Image from 'next/image';

interface Props {
  url: string | null;
  alt: string;
  /** Square size in pixels. Default 56. */
  size?: number;
  className?: string;
  /**
   * Image loading strategy. Default 'lazy' — keeps all existing callers unchanged.
   * Pass 'eager' on catalog cards so images load before the synchronous Print dialog
   * captures the page (ADR-3).
   */
  loading?: 'eager' | 'lazy';
}

export function ProductThumbnail({ url, alt, size = 56, className = '', loading = 'lazy' }: Props) {
  if (!url) {
    return (
      <div
        aria-hidden
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-lg bg-gray-100 ${className}`}
      />
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      loading={loading}
      className={`shrink-0 rounded-lg object-cover ${className}`}
    />
  );
}
