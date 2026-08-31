import { describe, it, expect } from 'vitest';
import { marcarSubstituidas, type AssinaturaPedido } from './useAssinaturaPedidos';

/**
 * Cada link de assinatura é de uma utilização. Para assinar outra vez, quem
 * trata do contrato envia um pedido NOVO — e quando esse é assinado, é essa a
 * assinatura que vale. A anterior continua a existir, e a poder ver-se, mas
 * deixa de ser a boa.
 */
function pedido(over: Partial<AssinaturaPedido>): AssinaturaPedido {
  return {
    id: 'p',
    papel: 'cliente',
    signatario_nome: 'Ana Reis',
    signatario_email: 'ana@exemplo.pt',
    documento_nome: 'Contrato de Aluguer',
    created_at: '2026-08-20T09:00:00Z',
    expires_at: '2026-09-20T09:00:00Z',
    assinado_em: null,
    substituida: false,
    de_versao_anterior: false,
    documento_path: 'x/documento.pdf',
    documento_assinado_path: null,
    ...over,
  };
}

describe('marcarSubstituidas', () => {
  it('a mais recente vale, a anterior fica substituída', () => {
    const r = marcarSubstituidas([
      pedido({ id: 'antiga', assinado_em: '2026-08-20T10:00:00Z' }),
      pedido({ id: 'nova', assinado_em: '2026-08-27T10:00:00Z' }),
    ]);

    expect(r.find((p) => p.id === 'antiga')?.substituida).toBe(true);
    expect(r.find((p) => p.id === 'nova')?.substituida).toBe(false);
  });

  it('uma assinatura sozinha nunca está substituída', () => {
    const r = marcarSubstituidas([pedido({ id: 'unica', assinado_em: '2026-08-20T10:00:00Z' })]);

    expect(r[0].substituida).toBe(false);
  });

  // Assinar de novo o contrato não torna antiga a assinatura da folha de danos.
  it('a substituição é por documento, não por contrato', () => {
    const r = marcarSubstituidas([
      pedido({ id: 'contrato-antigo', assinado_em: '2026-08-20T10:00:00Z' }),
      pedido({ id: 'contrato-novo', assinado_em: '2026-08-27T10:00:00Z' }),
      pedido({
        id: 'danos',
        documento_nome: 'Folha de Danos',
        assinado_em: '2026-08-21T10:00:00Z',
      }),
    ]);

    expect(r.find((p) => p.id === 'contrato-antigo')?.substituida).toBe(true);
    expect(r.find((p) => p.id === 'danos')?.substituida).toBe(false);
  });

  it('um pedido por assinar nunca é substituído — não há nada para substituir', () => {
    const r = marcarSubstituidas([
      pedido({ id: 'assinado', assinado_em: '2026-08-27T10:00:00Z' }),
      pedido({ id: 'por-assinar', assinado_em: null }),
    ]);

    expect(r.find((p) => p.id === 'por-assinar')?.substituida).toBe(false);
  });

  // A ordem da lista não pode decidir: quem manda é a data em que foi assinado.
  it('não depende da ordem em que os pedidos chegam', () => {
    const r = marcarSubstituidas([
      pedido({ id: 'nova', assinado_em: '2026-08-27T10:00:00Z' }),
      pedido({ id: 'antiga', assinado_em: '2026-08-20T10:00:00Z' }),
    ]);

    expect(r.find((p) => p.id === 'antiga')?.substituida).toBe(true);
    expect(r.find((p) => p.id === 'nova')?.substituida).toBe(false);
  });
});
