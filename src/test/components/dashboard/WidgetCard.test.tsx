/**
 * Unit tests for WidgetCard (WU3).
 *
 * Verifies:
 *  - renders children
 *  - applies the shared shell classes
 *  - accepts an optional className that is merged
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WidgetCard } from '@/components/dashboard/WidgetCard';

describe('WidgetCard', () => {
  it('renders children', () => {
    render(
      <WidgetCard>
        <p>Test content</p>
      </WidgetCard>
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('applies the shell classes: rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden', () => {
    const { container } = render(
      <WidgetCard>
        <p>Content</p>
      </WidgetCard>
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass('rounded-2xl');
    expect(card).toHaveClass('bg-white');
    expect(card).toHaveClass('shadow-sm');
    expect(card).toHaveClass('border');
    expect(card).toHaveClass('border-gray-100');
    expect(card).toHaveClass('overflow-hidden');
  });

  it('merges an optional className with the shell classes', () => {
    const { container } = render(
      <WidgetCard className="col-span-2">
        <p>Content</p>
      </WidgetCard>
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass('col-span-2');
    expect(card).toHaveClass('rounded-2xl');
  });
});
