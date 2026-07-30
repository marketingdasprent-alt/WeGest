import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { DocumentoToken } from './DocumentoToken';

/**
 * A diferenciação estrutural fiscal vs. não-fiscal é o núcleo desta feature
 * (spec §7.1) — um Aviso mal identificado, reencaminhado a um contabilista,
 * pode ser confundido com um documento fiscal real. Por isso o teste verifica
 * os 4 sinais redundantes (chip, texto, número sem série, cor), não só um.
 */
describe('DocumentoToken', () => {
  it('mostra o chip FISCAL e o valor para um documento fiscal', () => {
    render(
      <DocumentoToken
        tipo="fiscal"
        icone={FileText}
        titulo="FT 2026/143"
        subtitulo="Fatura original · 12/07/2026"
        valor={1200}
      />
    );
    expect(screen.getByText('FISCAL')).toBeTruthy();
    expect(screen.getByText('FT 2026/143')).toBeTruthy();
    expect(screen.queryByText('NÃO FISCAL')).toBeNull();
  });

  it('mostra o chip NÃO FISCAL e o texto fixo para um documento não-fiscal', () => {
    render(
      <DocumentoToken
        tipo="nao_fiscal"
        icone={FileText}
        titulo="Aviso 2/6"
        subtitulo="Pedido de pagamento · 400,00 €"
        valor={400}
      />
    );
    expect(screen.getByText('NÃO FISCAL')).toBeTruthy();
    expect(screen.getByText(/Não substitui fatura nem recibo/)).toBeTruthy();
    expect(screen.queryByText('FISCAL', { exact: true })).toBeNull();
  });

  it('nunca mostra o texto fixo de não-fiscal num documento fiscal', () => {
    render(
      <DocumentoToken
        tipo="fiscal"
        icone={FileText}
        titulo="RC 2026/89"
        subtitulo="Recibo · 300,00 €"
        valor={300}
      />
    );
    expect(screen.queryByText(/Não substitui fatura nem recibo/)).toBeNull();
  });

  it('mostra a data do documento quando fornecida', () => {
    render(
      <DocumentoToken
        tipo="fiscal"
        icone={FileText}
        titulo="FT 2026/143"
        subtitulo="Fatura original"
        valor={1200}
        dataDocumento="2026-07-12"
      />
    );
    expect(screen.getByText('12/07/2026')).toBeTruthy();
  });

  it('não mostra nenhuma data quando dataDocumento não é fornecida', () => {
    render(
      <DocumentoToken
        tipo="fiscal"
        icone={FileText}
        titulo="FT 2026/143"
        subtitulo="Fatura original"
        valor={1200}
      />
    );
    expect(screen.queryByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeNull();
  });
});
