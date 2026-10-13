import { describe, it, expect } from 'vitest';
// Fonte única — o ficheiro é TS puro, sem APIs de Deno, por isso o Vitest importa-o.
import {
  configDaLinha,
  eVariasLinhas,
  mensagemVariasIntegracoes,
  origemDaConsulta,
  originalPorNumeroValido,
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

describe('várias integrações onde se esperava uma', () => {
  it('reconhece o erro de várias linhas do maybeSingle e só esse', () => {
    expect(eVariasLinhas({ code: 'PGRST116' })).toBe(true);
    expect(eVariasLinhas({ code: '42501' })).toBe(false);
    expect(eVariasLinhas(null)).toBe(false);
  });

  it('diz que há mais de um software ativo, nunca que não há nenhum', () => {
    const msg = mensagemVariasIntegracoes('Dasp Rent Sul');
    expect(msg).toBe(
      'Dasp Rent Sul tem mais de um software de faturação ativo; escolha o fornecedor.'
    );
    expect(msg).not.toContain('não tem software');
    expect(mensagemVariasIntegracoes(null, 'primavera')).toBe(
      'Esta empresa tem mais de uma integração Primavera; escolha qual usar.'
    );
  });
});

describe('originalPorNumeroValido', () => {
  const daEmpresa = [{ id: 'ki-e1' }, { id: 'pv-e1' }];
  it('aceita a fatura original se a integração for da empresa do documento', () => {
    expect(originalPorNumeroValido('pv-e1', daEmpresa)).toBe(true);
  });
  it('recusa a de outra empresa da mesma org com o mesmo número', () => {
    expect(originalPorNumeroValido('ki-e2', daEmpresa)).toBe(false);
  });
  it('sem integração ou sem empresa conhecida não aceita', () => {
    expect(originalPorNumeroValido(null, daEmpresa)).toBe(false);
    expect(originalPorNumeroValido('ki-e1', [])).toBe(false);
  });
});
