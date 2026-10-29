import { describe, it, expect } from 'vitest';
import { explicarErroRecibo } from './reciboErro';

const comClasse = (msg: string, classe: string) => Object.assign(new Error(msg), { classe });

describe('explicarErroRecibo', () => {
  it('valor acima do pendente aponta para o KeyInvoice e para as FT26 8 a 28', () => {
    const e = explicarErroRecibo(
      new Error('insertReceipt falhou: Valor a liquidar superior ao valor pendente'),
      'keyinvoice'
    );
    expect(e.titulo).toContain('menos por pagar');
    expect(e.oQueFazer).toContain('FT26 8 a 28');
    expect(e.podeTentarDeNovo).toBe(true);
    expect(e.detalhe).toBe('insertReceipt falhou: Valor a liquidar superior ao valor pendente');
  });

  it.each([
    ['insertReceipt falhou: Série de documento inválida', 'série dos recibos'],
    [
      'Documento original "4 67/1" não encontrado — não é possível emitir o Recibo.',
      'não encontra',
    ],
    ['Não foi possível criar/obter o cliente (NIF 123): erro', 'dados do cliente'],
    ['KeyInvoice authenticate falhou: sem Sid', 'não conseguiu entrar'],
    ['Edge Function returned a non-2xx status code', 'Sem ligação'],
  ])('traduz "%s"', (msg, esperado) => {
    expect(explicarErroRecibo(new Error(msg), 'keyinvoice').titulo).toContain(esperado);
  });

  it('motivo desconhecido mantém a mensagem original para quem investiga', () => {
    const e = explicarErroRecibo(new Error('insertReceipt falhou: algo novo'), 'keyinvoice');
    expect(e.titulo).toBe('O KeyInvoice recusou o recibo.');
    expect(e.detalhe).toBe('insertReceipt falhou: algo novo');
  });

  it('resultado incerto no KeyInvoice proíbe repetir, mesmo com motivo conhecido', () => {
    const e = explicarErroRecibo(
      comClasse('insertReceipt: falha de transporte — timeout', 'unknown'),
      'keyinvoice'
    );
    expect(e.titulo).toContain('Não se sabe');
    expect(e.podeTentarDeNovo).toBe(false);
  });

  it('falha a gravar depois do KeyInvoice nomeia o recibo e proíbe repetir', () => {
    const e = explicarErroRecibo(
      { message: 'permission denied' },
      'gravar_apos_keyinvoice',
      '9 70/3'
    );
    expect(e.titulo).toContain('9 70/3');
    expect(e.oQueFazer).toContain('NÃO tente de novo');
    expect(e.podeTentarDeNovo).toBe(false);
    expect(e.detalhe).toBe('permission denied');
  });

  it('falha a gravar sem KeyInvoice pelo meio pode repetir', () => {
    expect(explicarErroRecibo(new Error('x'), 'gravar').podeTentarDeNovo).toBe(true);
  });
});
