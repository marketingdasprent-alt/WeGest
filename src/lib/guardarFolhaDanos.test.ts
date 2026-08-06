import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type jsPDF from 'jspdf';

// vi.hoisted: vi.mock() é hospedado ao topo do ficheiro, antes de qualquer
// `const` normal — mesmo padrão dos restantes testes que mockam o cliente.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { guardarFolhaDanos } from './guardarFolhaDanos';

/** jsPDF stub — só `output('datauristring')` é usado. */
const fakePdf = (dataUri = 'data:application/pdf;filename=f.pdf;base64,QUJD') =>
  ({ output: () => dataUri }) as unknown as jsPDF;

describe('guardarFolhaDanos', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arquiva o PDF nos anexos do contrato, em base64 puro', async () => {
    await guardarFolhaDanos({
      pdf: fakePdf(),
      contratoId: 'ct-1',
      matricula: 'AA-11-BB',
      momento: 'ENTREGA',
      token: 'tok-1',
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fn, opts] = invokeMock.mock.calls[0];
    expect(fn).toBe('guardar-folha-danos');
    expect(opts.body).toMatchObject({
      contratoId: 'ct-1',
      // Sem o prefixo `data:...;base64,` — a Edge Function faz atob() disto.
      pdfBase64: 'QUJD',
      filename: 'folha_danos_AA-11-BB_entrega_2026-08-05.pdf',
      nome: 'Folha de Danos — Entrega — AA-11-BB (05/08/2026)',
      token: 'tok-1',
    });
  });

  it('rotula a recolha e omite o token quando não há (fluxo autenticado)', async () => {
    await guardarFolhaDanos({
      pdf: fakePdf(),
      contratoId: 'ct-2',
      matricula: 'CC-22-DD',
      momento: 'RECOLHA',
    });

    const { body } = invokeMock.mock.calls[0][1];
    expect(body.token).toBeUndefined();
    expect(body.nome).toBe('Folha de Danos — Recolha — CC-22-DD (05/08/2026)');
    expect(body.filename).toBe('folha_danos_CC-22-DD_recolha_2026-08-05.pdf');
  });

  it('não chama nada sem contrato — não há onde arquivar', async () => {
    await guardarFolhaDanos({
      pdf: fakePdf(),
      contratoId: null,
      matricula: 'AA-11-BB',
      momento: 'ENTREGA',
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('ignora um PDF que não produza base64', async () => {
    await guardarFolhaDanos({
      pdf: fakePdf('data:application/pdf;base64,'),
      contratoId: 'ct-1',
      matricula: 'AA-11-BB',
      momento: 'ENTREGA',
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('nunca rejeita: o handover não pode falhar por causa do arquivo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('403') });
    await expect(
      guardarFolhaDanos({
        pdf: fakePdf(),
        contratoId: 'ct-1',
        matricula: 'AA-11-BB',
        momento: 'ENTREGA',
      })
    ).resolves.toBeUndefined();

    invokeMock.mockRejectedValueOnce(new Error('rede em baixo'));
    await expect(
      guardarFolhaDanos({
        pdf: fakePdf(),
        contratoId: 'ct-1',
        matricula: 'AA-11-BB',
        momento: 'ENTREGA',
      })
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
