// Só a lista de Contas/Resumo grava o líquido da semana, e só com o período
// fechado. A ficha do motorista (motoristaId) e o modo só leitura nunca gravam.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';

const carregar = vi.fn();
vi.mock('@/lib/resumoSemana/carregarDadosResumoSemana', () => ({
  carregarDadosResumoSemana: (...a: unknown[]) => carregar(...a),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { useContasResumoSemana } from './useContasResumoSemana';

const INI = new Date(2026, 10, 16);
const FIM = new Date(2026, 10, 22);

const dados = {
  motoristas: [
    {
      id: 'm1',
      nome: 'Rodrigo Miranda',
      recibo_verde: true,
      retencao_irs: null,
      retencao_iva_pct: null,
      retencao_irs_pct: null,
      corte_sem_recibo_pct: null,
      uber_uuid: null,
      bolt_id: null,
      gestor_responsavel: null,
      data_contratacao: null,
      status_ativo: true,
      desativado_em: null,
      created_at: '2026-01-01T00:00:00Z',
      is_conta_frota: false,
    },
  ],
  uberResumos: [],
  atividadeUber: [],
  uberDrivers: [],
  combustivel: [{ motorista_id: 'm1', amount: 10 }],
  portagens: [],
  contratos: [],
  tarifas: [],
  tarifasModelo: [],
  financeiro: [],
  boltResumos: [],
};

const upsert = vi.fn().mockResolvedValue({ error: null });
const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe('useContasResumoSemana — quem grava o líquido', () => {
  beforeEach(() => {
    carregar.mockReset().mockResolvedValue(dados);
    upsert.mockClear();
    from.mockReset().mockImplementation(() => ({ upsert }));
    rpc.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('ficha do motorista: calcula pela função e nunca grava', async () => {
    const { result } = renderHook(() =>
      useContasResumoSemana(INI, FIM, true, { soLeitura: true, motoristaId: 'm1' })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(carregar).toHaveBeenCalledWith(INI, FIM, 'm1');
    expect(result.current.resumos.map((r) => r.motorista_id)).toEqual(['m1']);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('motoristaId sem soLeitura também não grava (conta parcial)', async () => {
    const { result } = renderHook(() =>
      useContasResumoSemana(INI, FIM, true, { motoristaId: 'm1' })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lista com período fechado: grava', async () => {
    const { result } = renderHook(() => useContasResumoSemana(INI, FIM, true));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(carregar).toHaveBeenCalledWith(INI, FIM, undefined);
    expect(result.current.resumos).toHaveLength(1);
  });

  it('período por fechar: não carrega nem grava', async () => {
    const { result } = renderHook(() => useContasResumoSemana(INI, FIM, false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(carregar).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('erro a carregar: deixa de carregar e não mostra valores', async () => {
    carregar.mockRejectedValue(new Error('sem permissao'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useContasResumoSemana(INI, FIM, true, { soLeitura: true, motoristaId: 'm1' })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resumos).toEqual([]);
    erro.mockRestore();
  });
});
