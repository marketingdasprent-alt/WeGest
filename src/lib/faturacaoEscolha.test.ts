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
const PV: IntegracaoDaEmpresa = { id: 'pv', provider: 'primavera', ativo: true };

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

  it('Primavera desativado em Fatura-Recibo, com o motivo', () => {
    const r = montarOpcoes([KI, PV], 'FR', null);
    expect(r[1]).toMatchObject({
      disponivel: false,
      motivo: 'O Primavera ainda não emite Faturas-Recibo',
    });
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
    expect(escolherIntegracao([KI, PV], 'FR', 'pv')).toMatchObject({
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
    expect(escolherIntegracao([KI, PV], 'FR', null)).toEqual({ ok: true, integracaoId: 'ki' });
  });

  it('sem nenhuma ativa', () => {
    expect(escolherIntegracao([], 'FT', null)).toMatchObject({
      ok: false,
      codigo: 'sem_integracao',
    });
  });

  it('só Primavera ativo e pedem Fatura-Recibo', () => {
    expect(escolherIntegracao([PV], 'FR', null)).toMatchObject({
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
    expect(preSelecao(montarOpcoes([KI, PV], 'FR', 'pv'))).toBe('ki');
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
  it('Primavera só FT', () => {
    expect(motivoTipoNaoSuportado('primavera', 'FT')).toBeNull();
    expect(motivoTipoNaoSuportado('primavera', 'NC')).toBe(
      'O Primavera ainda não emite Notas de Crédito'
    );
  });
});
