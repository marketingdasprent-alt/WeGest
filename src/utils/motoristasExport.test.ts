import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Motorista } from '@/types/motorista';

// xlsx real escreveria um ficheiro para disco em Node — mock para isolar a
// lógica de montagem das linhas/colunas.
const aoaToSheet = vi.fn((..._args: unknown[]) => ({ '!ref': 'A1:AE3' }));
const bookNew = vi.fn((..._args: unknown[]) => ({}));
const bookAppendSheet = vi.fn((..._args: unknown[]) => undefined);
const writeFile = vi.fn((..._args: unknown[]) => undefined);
const decodeRange = vi.fn((..._args: unknown[]) => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }));
const encodeCell = vi.fn((..._args: unknown[]) => 'A1');

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: (...a: unknown[]) => aoaToSheet(...a),
    book_new: (...a: unknown[]) => bookNew(...a),
    book_append_sheet: (...a: unknown[]) => bookAppendSheet(...a),
    decode_range: (...a: unknown[]) => decodeRange(...a),
    encode_cell: (...a: unknown[]) => encodeCell(...a),
  },
  writeFile: (...a: unknown[]) => writeFile(...a),
}));

// Chainable que resolve directamente quando awaited (sem .single()/.maybeSingle()),
// tal como motorista_viaturas é consultado em fetchViaturasAtuais.
function chainableResolving<T>(result: T) {
  const c: Record<string, unknown> = {};
  const p = Promise.resolve(result);
  ['select', 'in', 'eq', 'is', 'order'].forEach((m) => {
    c[m] = vi.fn(() => c);
  });
  (c as unknown as { then: unknown }).then = (
    resolve: (v: T) => void,
    reject?: (r: unknown) => void
  ) => p.then(resolve, reject);
  return c;
}

let motoristaViaturasResult: { data: unknown; error: unknown } = { data: [], error: null };
const fromMock = vi.fn((..._args: unknown[]) => chainableResolving(motoristaViaturasResult));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

import { exportMotoristasExcel } from './motoristasExport';

function motorista(overrides: Partial<Motorista> = {}): Motorista {
  return {
    id: 'm1',
    codigo: 1,
    nome: 'Zé Motorista',
    nif: '123456789',
    documento_tipo: null,
    documento_numero: null,
    documento_validade: null,
    carta_conducao: null,
    carta_categorias: null,
    carta_validade: null,
    licenca_tvde_numero: null,
    licenca_tvde_validade: null,
    morada: 'Rua Teste, 1',
    codigo_postal: '1000-001',
    email: 'ze@x.pt',
    telefone: '912345678',
    data_contratacao: '2026-01-10',
    data_renovacao_contratacao: null,
    cidade: 'Lisboa',
    cidade_assinatura: null,
    status_ativo: true,
    recibo_verde: true,
    is_slot: false,
    slot_valor_semanal: null,
    seguro_valor_semanal: null,
    cartao_frota: null,
    cartao_bp: null,
    cartao_repsol: null,
    cartao_edp: null,
    iban: 'PT50000000000000000000000',
    observacoes: null,
    uber_uuid: null,
    bolt_id: null,
    gestor_responsavel: 'Gestor A',
    caucao_valor: null,
    lead_id: null,
    perfil_rascunho: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('exportMotoristasExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    motoristaViaturasResult = { data: [], error: null };
  });

  it('gera a folha com cabeçalhos e uma linha por motorista, incluindo a viatura atual', async () => {
    motoristaViaturasResult = {
      data: [
        {
          motorista_id: 'm1',
          data_inicio: '2026-06-01',
          viaturas: { matricula: 'AA-11-BB', marca: 'Toyota', modelo: 'Corolla' },
        },
      ],
      error: null,
    };

    await exportMotoristasExcel([motorista({ id: 'm1' }), motorista({ id: 'm2', codigo: 2 })]);

    expect(fromMock).toHaveBeenCalledWith('motorista_viaturas');
    expect(aoaToSheet).toHaveBeenCalledTimes(1);

    const [headers, row1, row2] = aoaToSheet.mock.calls[0][0] as string[][];
    expect(headers).toContain('NIF');
    expect(headers).toContain('Viatura Atual');
    expect(headers).toContain('Marca/Modelo');

    const idxViatura = headers.indexOf('Viatura Atual');
    const idxMarcaModelo = headers.indexOf('Marca/Modelo');
    const idxNif = headers.indexOf('NIF');

    // m1 tem viatura atual associada.
    expect(row1[idxViatura]).toBe('AA-11-BB');
    expect(row1[idxMarcaModelo]).toBe('Toyota Corolla');
    expect(row1[idxNif]).toBe('123456789');

    // m2 sem viatura atual (motorista_viaturas não devolveu nada para ele) — vazio, não crasha.
    expect(row2[idxViatura]).toBe('');

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [, filename] = writeFile.mock.calls[0];
    expect(filename).toMatch(/^motoristas_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('lista vazia não chama a query de viaturas nem crasha', async () => {
    await exportMotoristasExcel([]);
    expect(fromMock).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [headers] = aoaToSheet.mock.calls[0][0] as string[][];
    expect(headers.length).toBeGreaterThan(0);
  });
});
