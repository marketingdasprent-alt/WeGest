import { describe, it, expect } from 'vitest';
import { temDocumentoFiscalCertificado } from './cobrancaFiscal';

describe('temDocumentoFiscalCertificado', () => {
  it('cobrança com referência do documento externo tem documento', () => {
    expect(
      temDocumentoFiscalCertificado({ id: 'c1', documento_externo_ref: 'FT 2026/12' }, [])
    ).toBe(true);
  });

  it('cobrança sem referência mas com fatura emitida ligada tem documento', () => {
    const invoices = [{ cobranca_id: 'c1', status: 'emitida', tipo: 'FT' }];
    expect(temDocumentoFiscalCertificado({ id: 'c1', documento_externo_ref: null }, invoices)).toBe(
      true
    );
    expect(
      temDocumentoFiscalCertificado({ id: 'c1', documento_externo_ref: null }, [
        { cobranca_id: 'c1', status: 'emitida', tipo: 'FR' },
      ])
    ).toBe(true);
  });

  it('emissão que falhou (sem referência e sem fatura) não tem nada a creditar', () => {
    expect(temDocumentoFiscalCertificado({ id: 'c1', documento_externo_ref: null }, [])).toBe(
      false
    );
  });

  it('fatura de outra cobrança, falhada ou que é uma nota de crédito não conta', () => {
    const c = { id: 'c1', documento_externo_ref: null };
    expect(
      temDocumentoFiscalCertificado(c, [{ cobranca_id: 'c2', status: 'emitida', tipo: 'FT' }])
    ).toBe(false);
    expect(
      temDocumentoFiscalCertificado(c, [{ cobranca_id: 'c1', status: 'erro', tipo: 'FT' }])
    ).toBe(false);
    expect(
      temDocumentoFiscalCertificado(c, [{ cobranca_id: 'c1', status: 'emitida', tipo: 'NC' }])
    ).toBe(false);
  });
});
