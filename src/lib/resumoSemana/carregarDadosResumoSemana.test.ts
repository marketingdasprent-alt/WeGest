// A ficha não lê as tabelas do Financeiro nem os contratos: pede as linhas do
// motorista a resumo_semana_motorista_ficha. A lista continua a ler a org.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { carregarDadosResumoSemana } from './carregarDadosResumoSemana';

const INI = new Date(2026, 10, 16);
const FIM = new Date(2026, 10, 22);
const FECHADAS = [
  'bolt_resumos_semanais',
  'uber_drivers',
  'bp_transacoes',
  'repsol_transacoes',
  'edp_transacoes',
  'via_verde_transacoes',
  'contratos_renting',
];

const lidas: string[] = [];
function builder(tabela: string) {
  lidas.push(tabela);
  const b: any = new Proxy(
    {},
    {
      get(_a, prop) {
        if (prop === 'then') {
          return (r: (v: unknown) => void) =>
            r({ data: [{ tabela, motorista_id: 'm1', amount: 1 }], error: null });
        }
        return () => b;
      },
    }
  );
  return b;
}

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe('carregarDadosResumoSemana', () => {
  beforeEach(() => {
    lidas.length = 0;
    from.mockReset().mockImplementation(builder);
    rpc.mockReset();
  });

  it('ficha: as tabelas fechadas vêm da função, só deste motorista', async () => {
    rpc.mockResolvedValue({
      data: {
        bolt_resumos: [{ motorista_id: 'm1', liquido_a_pagar: 10 }],
        uber_drivers: [],
        combustivel: [{ motorista_id: 'm1', amount: 5 }],
        portagens: [],
        contratos: [],
      },
      error: null,
    });
    const dados = await carregarDadosResumoSemana(INI, FIM, 'm1');

    expect(rpc).toHaveBeenCalledWith('resumo_semana_motorista_ficha', {
      p_motorista_id: 'm1',
      p_inicio: '2026-11-16',
      p_fim: '2026-11-22',
    });
    expect(lidas.filter((t) => FECHADAS.includes(t))).toEqual([]);
    expect(dados.boltResumos).toEqual([{ motorista_id: 'm1', liquido_a_pagar: 10 }]);
    expect(dados.combustivel).toEqual([{ motorista_id: 'm1', amount: 5 }]);
    // O que o Gestor já lê continua a vir pelas suas políticas.
    expect(lidas).toEqual(
      expect.arrayContaining(['motoristas_ativos', 'uber_resumos_semanais', 'motorista_financeiro'])
    );
  });

  it('ficha: a função recusa → falha à vista, nunca valores a 0 €', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'sem permissao', code: '42501' } });
    await expect(carregarDadosResumoSemana(INI, FIM, 'm1')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('lista: lê a org inteira e não chama a função', async () => {
    const dados = await carregarDadosResumoSemana(INI, FIM);
    expect(rpc).not.toHaveBeenCalled();
    expect(lidas).toEqual(expect.arrayContaining(FECHADAS));
    // BP, Repsol e EDP juntos no combustível.
    expect(dados.combustivel.map((t) => (t as unknown as { tabela: string }).tabela)).toEqual([
      'bp_transacoes',
      'repsol_transacoes',
      'edp_transacoes',
    ]);
  });
});
