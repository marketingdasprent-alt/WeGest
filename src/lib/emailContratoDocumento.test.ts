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

const anexo = (datauri: string, filename: string) => ({ pdf: fakePdf(datauri), filename });

describe('enviarContratoDocumentoEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extrai o base64 puro do datauristring e invoca a edge function com o payload certo', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    await enviarContratoDocumentoEmail({
      to: 'cliente@x.pt',
      toNome: 'Cliente Teste',
      subject: 'Contrato de Aluguer — Contrato #123',
      mensagem: 'Olá',
      anexos: [
        anexo(
          'data:application/pdf;filename=generated.pdf;base64,JVBERi0xLjM=',
          'Contrato_123.pdf'
        ),
      ],
      orgId: 'org-1',
    });

    expect(invoke).toHaveBeenCalledWith('send-documento-fiscal-email', {
      body: {
        to: 'cliente@x.pt',
        toNome: 'Cliente Teste',
        subject: 'Contrato de Aluguer — Contrato #123',
        mensagem: 'Olá',
        intro: undefined,
        detalhes: undefined,
        anexos: [{ content: 'JVBERi0xLjM=', name: 'Contrato_123.pdf' }],
        org_id: 'org-1',
        emissorNome: undefined,
        emissorLogoUrl: undefined,
        titulo: undefined,
        categoria: undefined,
      },
    });
  });

  // Vários documentos escolhidos (Contrato + Declaração + Termo) têm de ir
  // num só email, cada um como ficheiro próprio — não colados num PDF.
  it('envia vários documentos como anexos separados numa só chamada', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    await enviarContratoDocumentoEmail({
      to: 'cliente@x.pt',
      subject: 'Contrato de Aluguer — Contrato #720',
      anexos: [
        anexo('data:application/pdf;base64,AAA=', 'Contrato_Aluguer_720.pdf'),
        anexo('data:application/pdf;base64,BBB=', 'Declaracao_720.pdf'),
        anexo('data:application/pdf;base64,CCC=', 'Termo_Responsabilidade_720.pdf'),
      ],
      orgId: 'org-1',
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    const body = invoke.mock.calls[0][1].body;
    expect(body.anexos).toEqual([
      { content: 'AAA=', name: 'Contrato_Aluguer_720.pdf' },
      { content: 'BBB=', name: 'Declaracao_720.pdf' },
      { content: 'CCC=', name: 'Termo_Responsabilidade_720.pdf' },
    ]);
  });

  it('erro da edge function (network/invoke) propaga como Error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'falhou a rede' } });

    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        mensagem: 'Msg',
        anexos: [anexo('data:application/pdf;base64,AAA=', 'a.pdf')],
        orgId: 'org-1',
      })
    ).rejects.toThrow('falhou a rede');
  });

  it('success:false na resposta propaga o erro devolvido pela função', async () => {
    invoke.mockResolvedValue({ data: { success: false, error: 'Brevo rejeitou' }, error: null });

    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        mensagem: 'Msg',
        anexos: [anexo('data:application/pdf;base64,AAA=', 'a.pdf')],
        orgId: 'org-1',
      })
    ).rejects.toThrow('Brevo rejeitou');
  });

  it('datauri sem "base64," dá erro claro em vez de enviar um anexo vazio', async () => {
    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        mensagem: 'Msg',
        anexos: [anexo('data:application/pdf;algo-inesperado', 'a.pdf')],
        orgId: 'org-1',
      })
    ).rejects.toThrow('Não foi possível preparar "a.pdf"');
    expect(invoke).not.toHaveBeenCalled();
  });

  // Um anexo mau no meio não pode deixar passar um email incompleto.
  it('falha antes de enviar se algum dos vários anexos for inválido', async () => {
    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        anexos: [
          anexo('data:application/pdf;base64,AAA=', 'bom.pdf'),
          anexo('data:application/pdf;sem-marcador', 'mau.pdf'),
        ],
        orgId: 'org-1',
      })
    ).rejects.toThrow('Não foi possível preparar "mau.pdf"');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sem anexos não chama a edge function', async () => {
    await expect(
      enviarContratoDocumentoEmail({
        to: 'x@x.pt',
        subject: 'Assunto',
        anexos: [],
        orgId: 'org-1',
      })
    ).rejects.toThrow('Nenhum documento para enviar');
    expect(invoke).not.toHaveBeenCalled();
  });
});
