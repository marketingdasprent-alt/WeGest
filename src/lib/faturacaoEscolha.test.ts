import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function e o Vitest usam o mesmo ficheiro.
import {
  escolherIntegracao,
  montarOpcoes,
  motivoTipoNaoSuportado,
  preSelecao,
  type IntegracaoDaEmpresa,
} from '../../supabase/functions/_shared/faturacao/escolha';

const KI: IntegracaoDaEmpresa = { id: 'ki', provider: 'keyinvoice', ativo: true };
// Primavera com o serviço configurado (emite todos os tipos) e o antigo, sem serviço (já não emite nada).
const PV: IntegracaoDaEmpresa = { id: 'pv', provider: 'primavera', ativo: true, servico: true };
const PV_ANTIGO: IntegracaoDaEmpresa = { id: 'pva', provider: 'primavera', ativo: true };
const MOTIVO_ANTIGO =
  'O Primavera deste emissor ainda não está configurado pelo serviço (Administração, Integrações)';

describe('montarOpcoes', () => {
  it('mostra sempre os dois fornecedores, o não configurado desativado', () => {
    const r = montarOpcoes([KI], 'FT', null);
    expect(r.map((o) => [o.provider, o.disponivel, o.motivo ?? null])).toEqual([
      ['keyinvoice', true, null],
      ['primavera', false, 'Não configurado para esta empresa'],
    ]);
  });

  it('integração inativa aparece desativada', () => {
    const r = montarOpcoes([KI, { ...PV, ativo: false }], 'FT', null);
    expect(r[1]).toMatchObject({
      integracao_id: 'pv',
      disponivel: false,
      motivo: 'Integração inativa',
    });
  });

  it('Primavera sem serviço configurado aparece desativado, com o motivo', () => {
    const r = montarOpcoes([KI, PV_ANTIGO], 'FT', null);
    expect(r[1]).toMatchObject({ disponivel: false, motivo: MOTIVO_ANTIGO });
  });

  it('Primavera com serviço está disponível para Fatura-Recibo', () => {
    expect(montarOpcoes([KI, PV], 'FR', null)[1]).toMatchObject({ disponivel: true });
  });

  it('marca a última usada', () => {
    const r = montarOpcoes([KI, PV], 'FT', 'pv');
    expect(r.find((o) => o.ultima_usada)?.provider).toBe('primavera');
  });

  it('com duas linhas do mesmo fornecedor prefere a ativa', () => {
    const r = montarOpcoes(
      [{ id: 'ki-velha', provider: 'keyinvoice', ativo: false }, KI],
      'FT',
      null
    );
    expect(r[0]).toMatchObject({ integracao_id: 'ki', disponivel: true });
  });

  it('ignora fornecedores desconhecidos', () => {
    expect(montarOpcoes([{ id: 'x', provider: 'moloni', ativo: true }], 'FT', null)).toHaveLength(
      2
    );
  });
});

describe('escolherIntegracao', () => {
  it('aceita a escolhida quando é da empresa, ativa e suporta o tipo', () => {
    expect(escolherIntegracao([KI, PV], 'FT', 'pv')).toEqual({ ok: true, integracaoId: 'pv' });
  });

  it('recusa um id que não está na lista da empresa (outra empresa ou outra org)', () => {
    expect(escolherIntegracao([KI, PV], 'FT', 'de-outra-org')).toMatchObject({
      ok: false,
      codigo: 'invalida',
    });
  });

  it('recusa a escolhida se não suportar o tipo', () => {
    expect(escolherIntegracao([KI, PV_ANTIGO], 'FT', 'pva')).toMatchObject({
      ok: false,
      codigo: 'nao_suporta',
    });
  });

  it('sem escolha e com uma só ativa, usa-a (chamadas antigas)', () => {
    expect(escolherIntegracao([KI], 'FT', undefined)).toEqual({ ok: true, integracaoId: 'ki' });
  });

  it('sem escolha e com duas que suportam o tipo, obriga a escolher', () => {
    expect(escolherIntegracao([KI, PV], 'FT', null)).toMatchObject({
      ok: false,
      codigo: 'escolha_obrigatoria',
    });
  });

  it('sem escolha, duas ativas mas só uma suporta o tipo: usa essa', () => {
    expect(escolherIntegracao([KI, PV_ANTIGO], 'FR', null)).toEqual({
      ok: true,
      integracaoId: 'ki',
    });
  });

  it('sem nenhuma ativa', () => {
    expect(escolherIntegracao([], 'FT', null)).toMatchObject({
      ok: false,
      codigo: 'sem_integracao',
    });
  });

  it('só Primavera sem serviço ativo: nenhum tipo se emite', () => {
    expect(escolherIntegracao([PV_ANTIGO], 'FR', null)).toMatchObject({
      ok: false,
      codigo: 'nao_suporta',
    });
  });
});

describe('preSelecao', () => {
  it('prefere a última usada se estiver disponível', () => {
    expect(preSelecao(montarOpcoes([KI, PV], 'FT', 'pv'))).toBe('pv');
  });
  it('a última usada indisponível para o tipo cai para a única disponível', () => {
    expect(preSelecao(montarOpcoes([KI, PV_ANTIGO], 'FT', 'pva'))).toBe('ki');
  });
  it('duas disponíveis sem histórico: nenhuma', () => {
    expect(preSelecao(montarOpcoes([KI, PV], 'FT', null))).toBeNull();
  });
  it('nenhuma disponível: nenhuma', () => {
    expect(preSelecao(montarOpcoes([], 'FT', null))).toBeNull();
  });
});

describe('motivoTipoNaoSuportado', () => {
  it('KeyInvoice suporta tudo', () => {
    expect(
      ['FT', 'FR', 'NC', 'RC'].map((t) => motivoTipoNaoSuportado('keyinvoice', t as 'FT'))
    ).toEqual([null, null, null, null]);
  });
  it('Primavera sem serviço não emite nenhum tipo; com serviço emite todos', () => {
    for (const tipo of ['FT', 'FR', 'NC', 'RC'] as const) {
      expect(motivoTipoNaoSuportado('primavera', tipo)).toBe(MOTIVO_ANTIGO);
      expect(motivoTipoNaoSuportado('primavera', tipo, false)).toBe(MOTIVO_ANTIGO);
      expect(motivoTipoNaoSuportado('primavera', tipo, true)).toBeNull();
    }
  });
});

describe('Primavera pelo serviço (emite todos os tipos)', () => {
  it('as opções mostram o Primavera do serviço disponível para NC, e o sem serviço não', () => {
    const doServico = montarOpcoes([PV], 'NC', null).find((o) => o.provider === 'primavera');
    expect(doServico?.disponivel).toBe(true);
    const antigo = montarOpcoes([PV_ANTIGO], 'NC', null).find((o) => o.provider === 'primavera');
    expect(antigo?.disponivel).toBe(false);
  });

  it('escolhe o Primavera do serviço para um recibo quando é o único ativo', () => {
    expect(escolherIntegracao([PV], 'RC')).toEqual({ ok: true, integracaoId: 'pv' });
  });

  it('com a escolha explícita aceita Fatura-Recibo; sem serviço recusa', () => {
    expect(escolherIntegracao([PV], 'FR', 'pv')).toEqual({ ok: true, integracaoId: 'pv' });
    expect(escolherIntegracao([PV_ANTIGO], 'FR', 'pva')).toMatchObject({
      ok: false,
      codigo: 'nao_suporta',
    });
  });

  it('com KeyInvoice e Primavera do serviço ativos, a escolha pura pede escolha (NC e recibo seguem a fatura no servidor)', () => {
    expect(escolherIntegracao([KI, PV], 'NC')).toMatchObject({
      ok: false,
      codigo: 'escolha_obrigatoria',
    });
  });
});
