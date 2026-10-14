import { describe, expect, it, vi } from 'vitest';
import { baixarPdfEmSegundoPlano } from './faturacao';
import type { InvoiceMetadata } from '@/types/faturacao';

const invoice = { id: 'inv-1', tipo: 'FT', numero: 'FA 2026/50' } as InvoiceMetadata;

describe('baixarPdfEmSegundoPlano', () => {
  it('volta logo, mesmo com o PDF ainda a caminho', () => {
    const baixar = vi.fn(() => new Promise<void>(() => {}));
    const avisar = vi.fn();
    expect(baixarPdfEmSegundoPlano(invoice, avisar, baixar)).toBeUndefined();
    expect(baixar).toHaveBeenCalledWith(invoice);
    expect(avisar).not.toHaveBeenCalled();
  });

  it('uma falha do PDF vira um aviso à parte, sem rebentar', async () => {
    const avisar = vi.fn();
    baixarPdfEmSegundoPlano(invoice, avisar, async () => {
      throw new Error('Primavera: o agente não devolveu o PDF a tempo. Tente novamente.');
    });
    await vi.waitFor(() => expect(avisar).toHaveBeenCalledTimes(1));
    expect(avisar.mock.calls[0][0]).toMatch(/^Documento emitido, mas o PDF não descarregou/);
    expect(avisar.mock.calls[0][0]).toContain('não devolveu o PDF a tempo');
  });

  it('sem documento não faz nada', () => {
    const baixar = vi.fn(async () => {});
    baixarPdfEmSegundoPlano(undefined, vi.fn(), baixar);
    expect(baixar).not.toHaveBeenCalled();
  });
});
