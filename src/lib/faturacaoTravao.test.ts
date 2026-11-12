import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function faturacao-emitir usa o mesmo ficheiro.
import {
  avisosDaDecisao,
  confirmaTotalEmitido,
  decidirTotalEmitido,
  decisaoSegura,
  mensagemNotificacaoTravao,
  RECUSA_NC_SEM_CONSULTA,
  recusaPorTravao,
} from '../../supabase/functions/_shared/faturacao/travao';
import {
  toleranciaTotal,
  totalComIva,
  totalEsperado,
} from '../../supabase/functions/_shared/faturacao/totais';

describe('decidirTotalEmitido', () => {
  it('total igual ao pedido: ok, e guarda o total fiscal', () => {
    expect(decidirTotalEmitido(1371.45, 1371.45, 'FT 1/1')).toEqual({
      estado: 'ok',
      totalFiscal: 1371.45,
    });
  });

  it('até 5 cêntimos é arredondamento, não trava', () => {
    expect(decidirTotalEmitido(100, 100.05, 'FT 1/1').estado).toBe('ok');
    expect(decidirTotalEmitido(100, 99.95, 'FT 1/1').estado).toBe('ok');
  });

  it('6 cêntimos de diferença já trava', () => {
    expect(decidirTotalEmitido(100, 100.06, 'FT 1/1').estado).toBe('divergente');
  });

  // Caso real da Dasp Rent Sul: pedido 1371,45, a KeyInvoice emitiu 1115,00.
  it('divergente traz número, esperado, real e motivo', () => {
    const d = decidirTotalEmitido(1371.45, 1115, 'FT 4 67/15');
    expect(d).toMatchObject({
      estado: 'divergente',
      totalFiscal: 1115,
      numero: 'FT 4 67/15',
      esperado: 1371.45,
      real: 1115,
      motivo: 'Documento FT 4 67/15: esperado 1371.45 €, real 1115.00 €.',
    });
    expect(d.estado === 'divergente' && d.aviso).toContain('FT 4 67/15');
  });

  it('total real acima do pedido também trava', () => {
    expect(decidirTotalEmitido(100, 123, 'FT 1/1').estado).toBe('divergente');
  });

  it('sem leitura (null, undefined, NaN) não confirma e não trava', () => {
    for (const real of [null, undefined, Number.NaN]) {
      expect(decidirTotalEmitido(100, real, 'FT 1/1')).toEqual({
        estado: 'nao_confirmado',
        totalFiscal: null,
      });
    }
  });

  // Um 0 num documento esperado positivo é leitura suspeita (CabecDoc por calcular), não prova.
  it('total real 0 ou negativo num FT/FR esperado positivo: não confirmado, não trava', () => {
    for (const tipo of ['FT', 'FR']) {
      for (const real of [0, -5]) {
        expect(decidirTotalEmitido(100, real, 'FT 1/1', 0.05, tipo)).toEqual({
          estado: 'nao_confirmado',
          totalFiscal: null,
        });
      }
    }
  });

  it('esperado 0 e real 0 continua ok', () => {
    expect(decidirTotalEmitido(0, 0, 'FT 1/1').estado).toBe('ok');
  });
});

describe('NC: o sinal do total lido ainda não está confirmado', () => {
  it('NC com real -123,00 contra esperado 123,00 não trava', () => {
    expect(decidirTotalEmitido(123, -123, 'NC 1/1', 0.05, 'NC')).toEqual({
      estado: 'ok',
      totalFiscal: 123,
    });
  });

  it('NC com real 123,00 também não trava', () => {
    expect(decidirTotalEmitido(123, 123, 'NC 1/1', 0.05, 'NC').estado).toBe('ok');
  });

  it('NC com real 0 não confirma', () => {
    expect(decidirTotalEmitido(123, 0, 'NC 1/1', 0.05, 'NC').estado).toBe('nao_confirmado');
  });

  it('NC com real 50 contra esperado 123 trava', () => {
    expect(decidirTotalEmitido(123, 50, 'NC 1/1', 0.05, 'NC').estado).toBe('divergente');
    expect(decidirTotalEmitido(123, -50, 'NC 1/1', 0.05, 'NC').estado).toBe('divergente');
  });

  it('FT mantém o sinal: real -123 contra esperado 123 não confirma (não é NC)', () => {
    expect(decidirTotalEmitido(123, -123, 'FT 1/1', 0.05, 'FT').estado).toBe('nao_confirmado');
  });
});

describe('decisaoSegura (nunca lança: o documento já existe no fornecedor)', () => {
  const ok = [{ quantidade: 1, preco_unitario: 100, taxa_iva: 23 }];

  it('itens válidos: decide como o travão', () => {
    expect(decisaoSegura(ok, false, 123, 'FT 1/1', 'FT')).toEqual({
      estado: 'ok',
      totalFiscal: 123,
    });
    expect(decisaoSegura(ok, false, 100, 'FT 1/1', 'FT').estado).toBe('divergente');
  });

  it('itens null/undefined/não array: nao_confirmado', () => {
    for (const itens of [null, undefined, 'x', 5]) {
      expect(decisaoSegura(itens as never, false, 123, 'FT 1/1', 'FT')).toEqual({
        estado: 'nao_confirmado',
        totalFiscal: null,
      });
    }
  });

  it('item null no array: nao_confirmado em vez de lançar', () => {
    expect(() => decisaoSegura([null] as never, true, 123, 'FT 1/1', 'FT')).not.toThrow();
    expect(decisaoSegura([null] as never, true, 123, 'FT 1/1', 'FT').estado).toBe('nao_confirmado');
  });

  it('taxa e preço em falta não lançam', () => {
    const r = decisaoSegura([{ quantidade: 1 }] as never, false, 0, 'FT 1/1', 'FT');
    expect(['ok', 'nao_confirmado']).toContain(r.estado);
  });

  it('sem leitura do total: nao_confirmado', () => {
    expect(decisaoSegura(ok, false, null, 'FT 1/1', 'FT').estado).toBe('nao_confirmado');
  });
});

describe('esperado por linha e tolerância proporcional (falso travão por arredondamento)', () => {
  const item = (quantidade, preco_unitario, taxa_iva = 23) => ({
    quantidade,
    preco_unitario,
    taxa_iva,
  });

  it('preços com IVA: quantidade 30 e erro de arredondamento do preço não trava', () => {
    // 10,10 + 23 % = 12,423: o fornecedor recebe 12,42 e multiplica por 30.
    const itens = [item(30, 10.1)];
    expect(totalEsperado(itens, true)).toBe(372.6);
    expect(totalComIva(itens)).toBeCloseTo(372.69, 10);
    // contra o esperado sem arredondar (9 cêntimos) a tolerância fixa travava uma fatura normal.
    expect(decidirTotalEmitido(totalComIva(itens), 372.6, 'FT 1/1').estado).toBe('divergente');
    expect(
      decidirTotalEmitido(totalEsperado(itens, true), 372.6, 'FT 1/1', toleranciaTotal(itens))
        .estado
    ).toBe('ok');
    expect(
      decidirTotalEmitido(totalComIva(itens), 372.6, 'FT 1/1', toleranciaTotal(itens)).estado
    ).toBe('ok');
  });

  it('regra por linha: base e IVA arredondados a 2 casas por linha', () => {
    expect(totalEsperado([item(1, 0.333), item(1, 0.333)], false)).toBe(0.82);
  });

  it('caso real do incidente (1115,00 contra 1371,45) trava sempre', () => {
    const itens = [item(1, 1115)];
    expect(totalEsperado(itens, false)).toBe(1371.45);
    expect(decidirTotalEmitido(1371.45, 1115, 'FT 4 67/15', toleranciaTotal(itens)).estado).toBe(
      'divergente'
    );
  });

  it('IVA incluído/excluído (23 %) trava mesmo com quantidade alta', () => {
    const itens = [item(30, 10)];
    const esperado = totalEsperado(itens, false);
    expect(decidirTotalEmitido(esperado, 300, 'FT 1/1', toleranciaTotal(itens)).estado).toBe(
      'divergente'
    );
  });

  it('muitas linhas pequenas com erro de cêntimo por linha não travam', () => {
    const itens = Array.from({ length: 20 }, () => item(1, 1.001));
    const esperado = totalEsperado(itens, false);
    expect(
      decidirTotalEmitido(esperado, esperado + 0.2, 'FT 1/1', toleranciaTotal(itens)).estado
    ).toBe('ok');
  });

  it('1 € de diferença trava numa fatura normal', () => {
    const itens = [item(30, 10), item(1, 50)];
    const esperado = totalEsperado(itens, false);
    expect(
      decidirTotalEmitido(esperado, esperado - 1, 'FT 1/1', toleranciaTotal(itens)).estado
    ).toBe('divergente');
  });

  it('a tolerância tem o mínimo de 0,05 e cresce com quantidades e linhas', () => {
    expect(toleranciaTotal([])).toBe(0.05);
    expect(toleranciaTotal([item(30, 10)])).toBeCloseTo(0.16, 10);
    expect(toleranciaTotal([item(1, 1), item(1, 1)])).toBeCloseTo(0.05, 10);
  });
});

describe('confirmaTotalEmitido (Primavera com total lido pelo agente)', () => {
  it('Primavera com total real divergente trava', () => {
    expect(confirmaTotalEmitido('FT')).toBe(true);
    const d = decidirTotalEmitido(123, 100, 'FA 2026/68');
    expect(d.estado).toBe('divergente');
    expect(avisosDaDecisao(d, 'FA 2026/68').totalDivergente).toEqual({
      numero: 'FA 2026/68',
      esperado: 123,
      real: 100,
    });
  });

  it('Primavera com total igual ao pedido guarda o total fiscal', () => {
    expect(confirmaTotalEmitido('FT')).toBe(true);
    expect(decidirTotalEmitido(123, 123, 'FA 2026/68')).toEqual({
      estado: 'ok',
      totalFiscal: 123,
    });
  });

  it('agente antigo ou leitura falhada (null/undefined): avisa, não trava, sem total fiscal', () => {
    expect(confirmaTotalEmitido('FT')).toBe(true);
    for (const total of [null, undefined]) {
      const d = decidirTotalEmitido(123, total, 'FA 2026/68');
      expect(d.estado).toBe('nao_confirmado');
      expect(d.totalFiscal).toBeNull();
      expect(avisosDaDecisao(d, 'FA 2026/68').totalNaoConfirmado).toBe(true);
    }
  });

  it('o RC não devolve total: nunca se confirma', () => {
    expect(confirmaTotalEmitido('RC')).toBe(false);
    expect(confirmaTotalEmitido('NC')).toBe(true);
  });
});

describe('recusaPorTravao', () => {
  it('integração livre: não recusa', () => {
    expect(recusaPorTravao(null, null)).toBeNull();
    expect(recusaPorTravao(undefined, 'x')).toBeNull();
  });

  it('travada: recusa com o motivo e o que fazer, sem ponto duplicado', () => {
    expect(
      recusaPorTravao('2026-11-12T10:00:00Z', 'Documento FT 1/1: esperado 10.00 €, real 8.00 €.')
    ).toBe(
      'Faturação travada: Documento FT 1/1: esperado 10.00 €, real 8.00 €. Peça a um administrador para desbloquear.'
    );
  });

  it('travada sem motivo gravado continua a recusar', () => {
    expect(recusaPorTravao('2026-11-12T10:00:00Z', '  ')).toContain('Faturação travada:');
  });
});

describe('avisosDaDecisao', () => {
  it('divergente: warning e totalDivergente estruturado', () => {
    const d = decidirTotalEmitido(1371.45, 1115, 'FT 1/1');
    const a = avisosDaDecisao(d, 'FT 1/1');
    expect(a.totalDivergente).toEqual({ numero: 'FT 1/1', esperado: 1371.45, real: 1115 });
    expect(a.warning).toContain('travada');
    expect(a.totalNaoConfirmado).toBeUndefined();
  });

  it('não confirmado: warning e totalNaoConfirmado, sem totalDivergente', () => {
    const a = avisosDaDecisao(decidirTotalEmitido(100, null, 'FT 1/1'), 'FT 1/1');
    expect(a.totalNaoConfirmado).toBe(true);
    expect(a.warning).toContain('FT 1/1');
    expect(a.totalDivergente).toBeUndefined();
  });

  it('ok: sem avisos', () => {
    expect(avisosDaDecisao(decidirTotalEmitido(100, 100, 'FT 1/1'), 'FT 1/1')).toEqual({});
  });
});

describe('textos', () => {
  it('a notificação diz o documento e o que aconteceu', () => {
    const d = decidirTotalEmitido(1371.45, 1115, 'FT 1/1');
    if (d.estado !== 'divergente') throw new Error('esperava divergente');
    const n = mensagemNotificacaoTravao(d);
    expect(n.titulo).toContain('travada');
    expect(n.mensagem).toContain('FT 1/1');
  });

  it('a recusa de NC sem consulta explica que nada foi emitido', () => {
    expect(RECUSA_NC_SEM_CONSULTA).toContain('nada foi emitido');
  });
});
