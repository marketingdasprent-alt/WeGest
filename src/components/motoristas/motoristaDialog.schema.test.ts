import { describe, it, expect } from 'vitest';
import { buildMotoristaPayload, normalizeNif, type FormValues } from './motoristaDialog.schema';

const baseValues: FormValues = {
  nome: 'João Silva',
  nif: '123 456 789',
  telefone: '',
  email: '',
  documento_tipo: 'Cartão Cidadão',
  documento_numero: '12345678',
  documento_validade: '',
  carta_conducao: 'PT-123',
  carta_categorias: ['B'],
  carta_validade: '',
  licenca_tvde_numero: '',
  licenca_tvde_validade: '',
  morada: '',
  codigo_postal: '',
  data_contratacao: '2026-01-01',
  cidade: '',
  status_ativo: true,
  is_slot: false,
  observacoes: '',
  iban: 'pt50 0002 0123 1234 5678 9015 4',
  gestor_responsavel: 'none',
  bolt_id: '',
  uber_uuid: '',
  documento_ficheiro_url: '',
  documento_identificacao_verso_url: '',
  carta_ficheiro_url: '',
  carta_conducao_verso_url: '',
  licenca_tvde_ficheiro_url: '',
  registo_criminal_url: '',
  comprovativo_morada_url: '',
  comprovativo_iban_url: '',
};

describe('normalizeNif', () => {
  it('remove espaços', () => {
    expect(normalizeNif('123 456 789')).toBe('123456789');
  });
});

describe('buildMotoristaPayload', () => {
  it('normaliza NIF (sem espaços) e IBAN (sem espaços, maiúsculas)', () => {
    const payload = buildMotoristaPayload(baseValues);
    expect(payload.nif).toBe('123456789');
    expect(payload.iban).toBe('PT50000201231234567890154');
  });

  it('converte o sentinel "none" de gestor_responsavel para null', () => {
    const payload = buildMotoristaPayload(baseValues);
    expect(payload.gestor_responsavel).toBeNull();
  });

  it('mantém o nome do gestor quando não é "none"', () => {
    const payload = buildMotoristaPayload({ ...baseValues, gestor_responsavel: 'Maria Gestora' });
    expect(payload.gestor_responsavel).toBe('Maria Gestora');
  });

  it('campos opcionais em branco viram null, não string vazia', () => {
    const payload = buildMotoristaPayload(baseValues);
    expect(payload.telefone).toBeNull();
    expect(payload.morada).toBeNull();
  });

  it('status_ativo e is_slot têm default quando undefined', () => {
    const payload = buildMotoristaPayload({
      ...baseValues,
      status_ativo: undefined,
      is_slot: undefined,
    });
    expect(payload.status_ativo).toBe(true);
    expect(payload.is_slot).toBe(false);
  });
});
