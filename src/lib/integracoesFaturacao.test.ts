import { describe, it, expect } from 'vitest';
import { filtroMesmoFornecedor, outraAtivaDoMesmoFornecedor } from './integracoesFaturacao';

const linha = (id: string, provider: string, emissor = 'e1', ativo = true) => ({
  id,
  plataforma: 'faturacao',
  ativo,
  emissor_id: emissor,
  config: { provider },
});

describe('outraAtivaDoMesmoFornecedor', () => {
  it('KeyInvoice ativo não conta como conflito para o Primavera', () => {
    expect(
      outraAtivaDoMesmoFornecedor([linha('ki', 'keyinvoice')], {
        id: 'pv',
        emissor_id: 'e1',
        provider: 'primavera',
      })
    ).toBe(false);
  });
  it('outro KeyInvoice ativo na mesma empresa é conflito', () => {
    expect(
      outraAtivaDoMesmoFornecedor([linha('ki', 'keyinvoice')], {
        id: 'novo',
        emissor_id: 'e1',
        provider: 'keyinvoice',
      })
    ).toBe(true);
  });
  it('a própria linha não conta', () => {
    expect(
      outraAtivaDoMesmoFornecedor([linha('ki', 'keyinvoice')], {
        id: 'ki',
        emissor_id: 'e1',
        provider: 'keyinvoice',
      })
    ).toBe(false);
  });
  it('outra empresa não conta', () => {
    expect(
      outraAtivaDoMesmoFornecedor([linha('ki', 'keyinvoice', 'e2')], {
        id: 'n',
        emissor_id: 'e1',
        provider: 'keyinvoice',
      })
    ).toBe(false);
  });
  it('linha sem provider conta como keyinvoice (o mesmo que o servidor)', () => {
    expect(
      outraAtivaDoMesmoFornecedor([{ ...linha('x', ''), config: {} }], {
        id: 'n',
        emissor_id: 'e1',
        provider: 'keyinvoice',
      })
    ).toBe(true);
  });
});

describe('filtroMesmoFornecedor', () => {
  it('keyinvoice inclui linhas sem provider e ignora maiúsculas', () => {
    expect(filtroMesmoFornecedor('KeyInvoice')).toEqual({
      tipo: 'or',
      expressao: 'config->>provider.is.null,config->>provider.ilike.keyinvoice',
    });
  });
  it('primavera usa ilike direto', () => {
    expect(filtroMesmoFornecedor('primavera')).toEqual({ tipo: 'ilike', valor: 'primavera' });
  });
});
