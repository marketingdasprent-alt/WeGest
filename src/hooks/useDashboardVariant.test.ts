import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useDashboardVariant } from './useDashboardVariant';

const mockUsePermissions = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

describe('useDashboardVariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin → variant executivo, role admin', () => {
    mockUsePermissions.mockReturnValue({
      isAdmin: true,
      cargo: null,
    });

    const { result } = renderHook(() => useDashboardVariant());

    expect(result.current.variant).toBe('executivo');
    expect(result.current.role).toBe('admin');
    expect(result.current.isExecutivo).toBe(true);
    expect(result.current.isOperacional).toBe(false);
  });

  it('gestor (cargo = gestor_tvde) → variant executivo, role gestor', () => {
    mockUsePermissions.mockReturnValue({
      isAdmin: false,
      cargo: 'gestor_tvde',
    });

    const { result } = renderHook(() => useDashboardVariant());

    expect(result.current.variant).toBe('executivo');
    expect(result.current.role).toBe('gestor');
    expect(result.current.isExecutivo).toBe(true);
    expect(result.current.isOperacional).toBe(false);
  });

  it('gestor (cargo = gestor_comercial) → variant executivo, role gestor', () => {
    mockUsePermissions.mockReturnValue({
      isAdmin: false,
      cargo: 'gestor_comercial',
    });

    const { result } = renderHook(() => useDashboardVariant());

    expect(result.current.variant).toBe('executivo');
    expect(result.current.role).toBe('gestor');
    expect(result.current.isExecutivo).toBe(true);
    expect(result.current.isOperacional).toBe(false);
  });

  it('operacional (cargo = colaborador) → variant operacional, role operacional', () => {
    mockUsePermissions.mockReturnValue({
      isAdmin: false,
      cargo: 'colaborador',
    });

    const { result } = renderHook(() => useDashboardVariant());

    expect(result.current.variant).toBe('operacional');
    expect(result.current.role).toBe('operacional');
    expect(result.current.isExecutivo).toBe(false);
    expect(result.current.isOperacional).toBe(true);
  });

  it('operacional (cargo = null) → variant operacional, role operacional', () => {
    mockUsePermissions.mockReturnValue({
      isAdmin: false,
      cargo: null,
    });

    const { result } = renderHook(() => useDashboardVariant());

    expect(result.current.variant).toBe('operacional');
    expect(result.current.role).toBe('operacional');
    expect(result.current.isOperacional).toBe(true);
  });
});
