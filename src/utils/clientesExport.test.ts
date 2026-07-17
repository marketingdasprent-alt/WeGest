import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClienteComDocumentos } from '@/types/cliente';

const aoaToSheet = vi.fn(() => ({ '!ref': 'A1:AZ3' }));
const bookNew = vi.fn(() => ({}));
const bookAppendSheet = vi.fn();
const writeFile = vi.fn();
const decodeRange = vi.fn(() => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }));
const encodeCell = vi.fn(() => 'A1');

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

// Chainable que resolve directamente quando awaited, tal como contratos_renting
// é consultado em fetchViaturasAtuais (sem .single()/.maybeSingle()).
function chainableResolving<T>(result: T) {
  const c: Record<string, unknown> = {};
  const p = Promise.resolve(result);
  ['select', 'in', 'is', 'order'].forEach((m) => {
    c[m] = vi.fn(() => c);
  });
  (c as unknown as { then: unknown }).then = (
    resolve: (v: T) => void,
    reject?: (r: unknown) => void
  ) => p.then(resolve, reject);
  return c;
}

let contratosResult: { data: unknown; error: unknown } = { data: [], error: null };
const fromMock = vi.fn(() => chainableResolving(contratosResult));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

import { exportClientesExcel } from './clientesExport';

function cliente(overrides: Partial<ClienteComDocumentos> = {}): ClienteComDocumentos {
  return {
    id: 'c1',
    org_id: 'org-1',
    codigo: 1,
    is_empresa: false,
    is_emissora: false,
    tipo_cliente: 'particular',
    nome: 'Maria Cliente',
    nome_comercial: null,
    nif: '987654321',
    telefone: '913000000',
    email: 'maria@x.pt',
    iban: 'PT50111111111111111111111',
    data_nascimento: '1990-05-01',
    naturalidade: 'Lisboa',
    genero: 'F',
    observacoes: null,
    morada: 'Rua A, 1',
    codigo_postal: '2000-001',
    localidade: 'Santarém',
    cidade: 'Santarém',
    pais: 'Portugal',
    sede: null,
    representante: null,
    cargo_representante: null,
    licenca_tvde: null,
    licenca_validade: null,
    papel_timbrado: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    documentoIdentificacao: null,
    cartaConducao: null,
    ligacaoDocumento: null,
    ligacaoCarta: null,
    ...overrides,
  };
}

describe('exportClientesExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contratosResult = { data: [], error: null };
  });

  it('gera a folha com cabeçalhos e uma linha por cliente, incluindo a viatura do contrato activo', async () => {
    contratosResult = {
      data: [
        {
          cliente_id: 'c1',
          matricula: 'CC-22-DD',
          data_inicio: '2026-06-01',
          viaturas: { marca: 'Renault', modelo: 'Clio' },
        },
      ],
      error: null,
    };

    await exportClientesExcel([cliente({ id: 'c1' }), cliente({ id: 'c2', codigo: 2 })]);

    expect(fromMock).toHaveBeenCalledWith('contratos_renting');
    expect(aoaToSheet).toHaveBeenCalledTimes(1);

    const [headers, row1, row2] = aoaToSheet.mock.calls[0][0] as string[][];
    expect(headers).toContain('NIF');
    expect(headers).toContain('Viatura Atual');
    expect(headers).toContain('Marca/Modelo');

    const idxViatura = headers.indexOf('Viatura Atual');
    const idxMarcaModelo = headers.indexOf('Marca/Modelo');
    const idxNif = headers.indexOf('NIF');

    expect(row1[idxViatura]).toBe('CC-22-DD');
    expect(row1[idxMarcaModelo]).toBe('Renault Clio');
    expect(row1[idxNif]).toBe('987654321');

    // c2 sem contrato activo — vazio, não crasha.
    expect(row2[idxViatura]).toBe('');

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [, filename] = writeFile.mock.calls[0];
    expect(filename).toMatch(/^clientes_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it('lista vazia não chama a query de contratos nem crasha', async () => {
    await exportClientesExcel([]);
    expect(fromMock).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledTimes(1);
  });
});
