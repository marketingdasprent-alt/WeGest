import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { consultarDocumentoFiscal } from './faturacao';

describe('consultarDocumentoFiscal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pede a acção de leitura com o número e a cobrança', async () => {
    invokeMock.mockResolvedValue({ data: { success: true, suportado: false }, error: null });
    await consultarDocumentoFiscal('4 67/15', 'cob-1');
    expect(invokeMock).toHaveBeenCalledWith('faturacao-emitir', {
      body: {
        action: 'consultar_documento',
        documento_referencia: '4 67/15',
        cobranca_id: 'cob-1',
      },
    });
  });

  it('devolve os totais do fornecedor', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        totalProvider: 590,
        totalWegest: 725.7,
        ncsEmitidas: 0,
        saldoCreditavel: 590,
        voided: false,
      },
      error: null,
    });
    await expect(consultarDocumentoFiscal('4 67/15')).resolves.toEqual({
      suportado: true,
      totalProvider: 590,
      totalWegest: 725.7,
      ncsEmitidas: 0,
      saldoCreditavel: 590,
      voided: false,
    });
  });

  it('fornecedor sem consulta devolve suportado false', async () => {
    invokeMock.mockResolvedValue({ data: { success: true, suportado: false }, error: null });
    await expect(consultarDocumentoFiscal('4 67/15')).resolves.toEqual({ suportado: false });
  });

  it('falha de transporte e resposta sem sucesso lançam, nunca passam como suportado', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('rede em baixo') });
    await expect(consultarDocumentoFiscal('x')).rejects.toThrow('rede em baixo');
    invokeMock.mockResolvedValueOnce({
      data: { success: false, error: 'Documento não encontrado' },
      error: null,
    });
    await expect(consultarDocumentoFiscal('x')).rejects.toThrow('Documento não encontrado');
  });
});
