import { describe, it, expect, vi, beforeEach } from 'vitest';
import type jsPDF from 'jspdf';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { enviarContratoDocumentoEmail } from './emailContratoDocumento';

function fakePdf(datauri: string): jsPDF {
  return { output: vi.fn(() => datauri) } as unknown as jsPDF;
}

describe('enviarContratoDocumentoEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extrai o base64 puro do datauristring e invoca a edge function com o payload certo', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const pdf = fakePdf('data:application/pdf;filename=generated.pdf;base64,JVBERi0xLjM=');

    await enviarContratoDocumentoEmail({
      to: 'cliente@x.pt',
      toNome: 'Cliente Teste',
      subject: 'Contrato de Aluguer — Contrato #123',
      mensagem: 'Olá',
      pdf,
      filename: 'Contrato_123.pdf',
    });

    expect(invoke).toHaveBeenCalledWith('send-documento-fiscal-email', {
      body: {
        to: 'cliente@x.pt',
        toNome: 'Cliente Teste',
        subject: 'Contrato de Aluguer — Contrato #123',
        mensagem: 'Olá',
        pdfBase64: 'JVBERi0xLjM=',
        filename: 'Contrato_123.pdf',
      },
    });
  });

  it('erro da edge function (network/invoke) propaga como Error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'falhou a rede' } });
    const pdf = fakePdf('data:application/pdf;base64,AAA=');

    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        mensagem: 'Msg',
        pdf,
        filename: 'a.pdf',
      })
    ).rejects.toThrow('falhou a rede');
  });

  it('success:false na resposta propaga o erro devolvido pela função', async () => {
    invoke.mockResolvedValue({ data: { success: false, error: 'Brevo rejeitou' }, error: null });
    const pdf = fakePdf('data:application/pdf;base64,AAA=');

    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        mensagem: 'Msg',
        pdf,
        filename: 'a.pdf',
      })
    ).rejects.toThrow('Brevo rejeitou');
  });

  it('datauri sem "base64," dá erro claro em vez de enviar um anexo vazio', async () => {
    const pdf = fakePdf('data:application/pdf;algo-inesperado');

    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        mensagem: 'Msg',
        pdf,
        filename: 'a.pdf',
      })
    ).rejects.toThrow('Não foi possível preparar o PDF');
    expect(invoke).not.toHaveBeenCalled();
  });
});
