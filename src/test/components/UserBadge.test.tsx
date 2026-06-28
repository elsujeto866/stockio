/**
 * Unit tests for UserBadge.
 *
 * Presentational navbar control: circular initial avatar + display name + role.
 * - Initial is the uppercased first char of the name (falls back to email).
 * - Display name falls back to email when name is null/blank.
 * - Role is mapped to a Spanish label and omitted when null.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserBadge } from '@/components/UserBadge';

describe('UserBadge', () => {
  it('shows the uppercase initial of the name', () => {
    render(<UserBadge name="Dorian" email="d@x.com" rol="admin" />);
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('shows the display name', () => {
    render(<UserBadge name="Dorian" email="d@x.com" rol="admin" />);
    expect(screen.getByText('Dorian')).toBeInTheDocument();
  });

  it('maps admin rol to "Administrador"', () => {
    render(<UserBadge name="Dorian" email="d@x.com" rol="admin" />);
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('maps operador rol to "Operador"', () => {
    render(<UserBadge name="Ana" email="a@x.com" rol="operador" />);
    expect(screen.getByText('Operador')).toBeInTheDocument();
  });

  it('falls back to email when name is null, deriving the initial from it', () => {
    render(<UserBadge name={null} email="zoe@x.com" rol="admin" />);
    expect(screen.getByText('zoe@x.com')).toBeInTheDocument();
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('falls back to email when name is blank whitespace', () => {
    render(<UserBadge name="   " email="kev@x.com" rol="operador" />);
    expect(screen.getByText('kev@x.com')).toBeInTheDocument();
  });

  it('omits the role line when rol is null', () => {
    render(<UserBadge name="Dorian" email="d@x.com" rol={null} />);
    expect(screen.queryByText('Administrador')).not.toBeInTheDocument();
    expect(screen.queryByText('Operador')).not.toBeInTheDocument();
  });
});
