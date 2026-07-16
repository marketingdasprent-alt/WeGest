import { describe, it, expect } from 'vitest';
import { tipoRealizacaoPendenteEsperada } from './realizacaoPendente';
import { isAberturaReal, type ContratoHistoricoEvento } from '@/hooks/useContratoHistorico';

type ContratoInput = Parameters<typeof tipoRealizacaoPendenteEsperada>[0];

const contrato = (over: Record<string, unknown> = {}): ContratoInput =>
  ({ estado_operacional: 'agendado', substituido_em: null, ...over }) as ContratoInput;

describe('tipoRealizacaoPendenteEsperada (banner Realizar entrega/recolha)', () => {
  it('agendado espera entrega; em_curso espera recolha', () => {
    expect(tipoRealizacaoPendenteEsperada(contrato())).toBe('entrega');
    expect(tipoRealizacaoPendenteEsperada(contrato({ estado_operacional: 'em_curso' }))).toBe(
      'recolha'
    );
  });

  it('fechado/devolvido/substituído/inexistente → null', () => {
    expect(
      tipoRealizacaoPendenteEsperada(contrato({ estado_operacional: 'cancelado' }))
    ).toBeNull();
    expect(
      tipoRealizacaoPendenteEsperada(contrato({ estado_operacional: 'devolvido' }))
    ).toBeNull();
    expect(
      tipoRealizacaoPendenteEsperada(contrato({ substituido_em: '2026-07-01T00:00:00Z' }))
    ).toBeNull();
    expect(tipoRealizacaoPendenteEsperada(null)).toBeNull();
  });

  it('FATURADO não esconde a realização pendente (regressão #611 BL-60-FQ)', () => {
    // A fatura congela os valores fiscais (trigger na BD), NÃO o ciclo
    // operacional. Um guard `!isFacturado` no useContratoForm escondia para
    // sempre o banner "Entrega pendente" no fluxo "criar + faturar à cabeça"
    // e o contrato ficava preso em "Agendado" com o carro na rua. Se esta
    // função (ou o enabled da query no useContratoForm) voltar a olhar para
    // o estado_financeiro, este teste é o alarme.
    expect(tipoRealizacaoPendenteEsperada(contrato({ estado_financeiro: 'facturado' }))).toBe(
      'entrega'
    );
    expect(
      tipoRealizacaoPendenteEsperada(
        contrato({ estado_operacional: 'em_curso', estado_financeiro: 'facturado' })
      )
    ).toBe('recolha');
  });
});

const eventoAberto = (detalhe: string | null): ContratoHistoricoEvento => ({
  evento_tipo: 'contrato_aberto',
  ator_id: null,
  ator_nome: 'Teste',
  detalhe,
  criado_em: '2026-07-13T16:11:00Z',
});

describe('isAberturaReal (marco "Contrato aberto por" no histórico)', () => {
  it('criação em "agendado" NÃO é abertura real (regressão #611: dizia aberto sem nunca ter aberto)', () => {
    expect(isAberturaReal(eventoAberto('estado inicial: agendado'))).toBe(false);
  });
  it('nascer já em curso conta como abertura', () => {
    expect(isAberturaReal(eventoAberto('estado inicial: em_curso'))).toBe(true);
  });
  it('transição real agendado → em_curso conta como abertura', () => {
    expect(isAberturaReal(eventoAberto('agendado → em_curso'))).toBe(true);
  });
  it('sem detalhe assume abertura (eventos antigos, antes do detalhe existir)', () => {
    expect(isAberturaReal(eventoAberto(null))).toBe(true);
  });
});
