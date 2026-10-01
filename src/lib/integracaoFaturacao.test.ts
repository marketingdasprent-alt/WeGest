import { describe, it, expect } from 'vitest';
// Fonte única — o ficheiro é TS puro, sem APIs de Deno, por isso o Vitest importa-o.
import {
  configDaLinha,
  origemDaConsulta,
} from '../../supabase/functions/_shared/faturacao/integracao';

describe('configDaLinha', () => {
  it('lê chave, provider e settings da linha e guarda o id da integração', () => {
    const cfg = configDaLinha({
      id: 'int-1',
      client_secret: 'chave',
      config: { provider: 'KeyInvoice', doctypes: { FT: '4' } },
    });
    expect(cfg).toEqual({
      integracaoId: 'int-1',
      provider: 'keyinvoice',
      apiKey: 'chave',
      settings: { provider: 'KeyInvoice', doctypes: { FT: '4' } },
    });
  });

  it('sem provider na config assume keyinvoice', () => {
    expect(configDaLinha({ id: 'x', client_secret: null, config: null }).provider).toBe(
      'keyinvoice'
    );
  });

  it('o provider forçado (teste de ligação) ganha ao da config', () => {
    const cfg = configDaLinha(
      { id: 'x', client_secret: 'k', config: { provider: 'keyinvoice' } },
      'primavera'
    );
    expect(cfg.provider).toBe('primavera');
  });
});

describe('origemDaConsulta', () => {
  it('fatura com integração gravada usa essa integração', () => {
    expect(origemDaConsulta({ integracao_id: 'demo' })).toEqual({
      tipo: 'integracao_da_fatura',
      integracaoId: 'demo',
    });
  });

  it('fatura sem integração gravada usa a empresa do contrato', () => {
    expect(origemDaConsulta({ integracao_id: null })).toEqual({ tipo: 'empresa_do_contrato' });
  });

  it('fatura que não está no espelho local usa a empresa do contrato', () => {
    expect(origemDaConsulta(null)).toEqual({ tipo: 'empresa_do_contrato' });
  });
});
