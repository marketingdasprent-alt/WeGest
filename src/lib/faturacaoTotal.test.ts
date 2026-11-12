import { describe, it, expect, vi, beforeEach } from 'vitest';

const { toastMock } = vi.hoisted(() => ({ toastMock: { error: vi.fn() } }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { avisarTotalDaEmissao, mensagensTotalEmissao } from './faturacaoTotal';

describe('faturacaoTotal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem campos de total não há mensagens nem toast', () => {
    expect(mensagensTotalEmissao({})).toEqual([]);
    avisarTotalDaEmissao({});
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('total divergente diz o número, o total real e o esperado', () => {
    const [msg] = mensagensTotalEmissao({
      totalDivergente: { numero: '4 67/15', esperado: 590, real: 725.7 },
    });
    expect(msg).toContain('Fatura 4 67/15 emitida com total');
    expect(msg).toContain('€725,70');
    expect(msg).toContain('€590,00');
    expect(msg).not.toContain('�');
    expect(msg).toContain('A emissão de faturas desta integração foi travada.');
  });

  it('total não confirmado tem o seu texto', () => {
    expect(mensagensTotalEmissao({ totalNaoConfirmado: true })).toEqual([
      'Total da fatura não confirmado na KeyInvoice; confirme o documento antes de emitir mais.',
    ]);
  });

  it('o toast é persistente, com botão de fechar e id estável por número', () => {
    avisarTotalDaEmissao({ totalDivergente: { numero: '4 67/15', esperado: 590, real: 725.7 } });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('€725,70'), {
      duration: Infinity,
      closeButton: true,
      id: 'total-4 67/15',
    });
  });

  it('total não confirmado também é persistente e deduplicado', () => {
    avisarTotalDaEmissao({ totalNaoConfirmado: true });
    expect(toastMock.error).toHaveBeenCalledWith(expect.any(String), {
      duration: Infinity,
      closeButton: true,
      id: 'total-nao-confirmado',
    });
  });
});
