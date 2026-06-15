import { describe, it, expect } from 'vitest';
import { RECURSOS, type RecursoKey } from './permissions';

describe('RECURSOS (Permissions)', () => {
  it('deve ter constantes de permissões bem definidas', () => {
    expect(RECURSOS.CRM_VER).toBe('crm_ver');
    expect(RECURSOS.MOTORISTAS_VER).toBe('motoristas_ver');
    expect(RECURSOS.ADMIN_UTILIZADORES).toBe('admin_utilizadores');
  });

  it('todas as constantes devem ser strings não-vazias', () => {
    Object.entries(RECURSOS).forEach(([key, value]) => {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    });
  });

  it('não deve ter valores duplicados', () => {
    const values = Object.values(RECURSOS);
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it('deve ter grupos de permissões bem organizados', () => {
    // CRM
    expect(RECURSOS.CRM_VER).toBeDefined();
    expect(RECURSOS.CRM_EXPORTAR).toBeDefined();

    // Motoristas
    expect(RECURSOS.MOTORISTAS_VER).toBeDefined();
    expect(RECURSOS.MOTORISTAS_CRIAR).toBeDefined();
    expect(RECURSOS.MOTORISTAS_EDITAR).toBeDefined();

    // Viaturas
    expect(RECURSOS.VIATURAS_VER).toBeDefined();
    expect(RECURSOS.VIATURAS_CRIAR).toBeDefined();

    // Admin
    expect(RECURSOS.ADMIN_UTILIZADORES).toBeDefined();
    expect(RECURSOS.ADMIN_GRUPOS).toBeDefined();
  });

  it('tipo RecursoKey deve ser válido', () => {
    const recurso: RecursoKey = 'motoristas_ver';
    expect(recurso).toBe('motoristas_ver');
  });
});
