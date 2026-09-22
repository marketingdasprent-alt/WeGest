import { describe, it, expect } from 'vitest';
import { associacaoViaturaAtiva, filtroDataFimViva } from './associacaoViatura';

const HOJE = '2026-09-22';

describe('associacaoViaturaAtiva', () => {
  it('conta como viva a associação sem data de fim', () => {
    expect(associacaoViaturaAtiva({ status: 'ativo', data_fim: null }, HOJE)).toBe(true);
  });

  it('conta como viva a associação cuja data de fim ainda não chegou', () => {
    // Caso real do contrato #736: o trigger carimbou data_fim = 2026-10-01 (o
    // fim do mês de renovação) e deixou o status em 'ativo'. O carro está com
    // o motorista — o perfil escondia-o porque exigia data_fim IS NULL.
    expect(associacaoViaturaAtiva({ status: 'ativo', data_fim: '2026-10-01' }, HOJE)).toBe(true);
  });

  it('conta como viva no próprio dia em que termina', () => {
    expect(associacaoViaturaAtiva({ status: 'ativo', data_fim: HOJE }, HOJE)).toBe(true);
  });

  it('não conta a associação cuja data de fim já passou, mesmo com status ativo', () => {
    // A tab Viaturas mostrava-a como "Viatura Atual" por olhar só ao status.
    expect(associacaoViaturaAtiva({ status: 'ativo', data_fim: '2026-09-21' }, HOJE)).toBe(false);
  });

  it('não conta a associação encerrada, mesmo sem data de fim', () => {
    expect(associacaoViaturaAtiva({ status: 'encerrado', data_fim: null }, HOJE)).toBe(false);
  });

  it('trata o status em falta como não activo', () => {
    expect(associacaoViaturaAtiva({ data_fim: null }, HOJE)).toBe(false);
  });

  it('ignora a hora quando a data de fim vem com timestamp', () => {
    expect(
      associacaoViaturaAtiva({ status: 'ativo', data_fim: '2026-09-22T23:59:59+00' }, HOJE)
    ).toBe(true);
  });
});

describe('filtroDataFimViva', () => {
  it('devolve o fragmento .or() do PostgREST para o mesmo critério', () => {
    expect(filtroDataFimViva(HOJE)).toBe('data_fim.is.null,data_fim.gte.2026-09-22');
  });
});
