import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AssinarDocumento } from './AssinarDocumento';
import type { DocumentoSnapshot } from '@/utils/document-template/snapshot';

/**
 * A página onde o cliente, condutor ou motorista assina.
 *
 * É a única parte do WeGest que corre para gente de fora, sem sessão, e a
 * única oportunidade de recolher uma assinatura: quem fecha a página irritado
 * não volta. Por isso o que se testa aqui é sobretudo o que acontece quando
 * corre mal.
 */

const snapshotDeTeste: DocumentoSnapshot = {
  versao: 1,
  criadoEm: '2026-08-25T10:00:00.000Z',
  template: {
    id: 'tpl-1',
    nome: 'Contrato de Aluguer',
    tipo: 'contrato_aluguer',
    empresa_id: 'emp-1',
    papel_timbrado_url: null,
    template_data: { conteudo: '<p>Contrato 733</p><p>{{assinatura_cliente}}</p>' },
    campos_dinamicos: { motorista: [], empresa: [], documento: [] },
  },
  motoristaData: {},
  documentData: { numero_contrato: '733' },
};

function renderPagina(props: Parameters<typeof AssinarDocumento>[0]) {
  return render(
    <MemoryRouter initialEntries={['/assinar/tok-1']}>
      <Routes>
        <Route path="/assinar/:token" element={<AssinarDocumento {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * O canvas não desenha em jsdom. Em vez de inventar um botão de teste dentro da
 * interface real, os testes entram pela porta legítima: `assinaturaInicial`, que
 * é como o rascunho guardado volta ao ecrã depois de um refresh.
 */
const TRACO = 'data:image/png;base64,iVBORw0KGgo=';

describe('AssinarDocumento', () => {
  it('mostra o documento e deixa assinar quando o link é válido', async () => {
    const carregar = vi.fn().mockResolvedValue({
      estado: 'valido',
      documentoNome: 'Contrato de Aluguer',
      papel: 'cliente',
      signatarioNome: 'Ana Reis',
      expiraEm: '2026-09-24T12:00:00Z',
      snapshot: snapshotDeTeste,
    });

    renderPagina({ carregar, submeter: vi.fn() });

    expect(await screen.findByText('Contrato de Aluguer')).toBeInTheDocument();
    expect(screen.getByText(/Ana Reis/)).toBeInTheDocument();
    expect(carregar).toHaveBeenCalledWith('tok-1');
  });

  it('mantém a assinatura no ecrã quando a submissão falha', async () => {
    const carregar = vi.fn().mockResolvedValue({
      estado: 'valido',
      documentoNome: 'Contrato de Aluguer',
      papel: 'cliente',
      signatarioNome: 'Ana Reis',
      expiraEm: '2026-09-24T12:00:00Z',
      snapshot: snapshotDeTeste,
    });
    const submeter = vi.fn().mockRejectedValue(new Error('rede'));

    renderPagina({ carregar, submeter, assinaturaInicial: TRACO });

    await screen.findByText('Contrato de Aluguer');
    fireEvent.click(screen.getByRole('button', { name: /^assinar/i }));

    await waitFor(() => expect(submeter).toHaveBeenCalled());

    // O erro aparece, e a assinatura desenhada não se perde: quem já assinou
    // não volta a assinar por causa de um túnel.
    expect(await screen.findByText(/não foi possível enviar/i)).toBeInTheDocument();
    expect(screen.getByTestId('assinatura-presente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^assinar/i })).toBeEnabled();
  });

  it('não deixa assinar sem nada desenhado', async () => {
    const carregar = vi.fn().mockResolvedValue({
      estado: 'valido',
      documentoNome: 'Contrato de Aluguer',
      papel: 'cliente',
      signatarioNome: 'Ana Reis',
      expiraEm: '2026-09-24T12:00:00Z',
      snapshot: snapshotDeTeste,
    });

    renderPagina({ carregar, submeter: vi.fn() });

    await screen.findByText('Contrato de Aluguer');
    expect(screen.getByRole('button', { name: /^assinar/i })).toBeDisabled();
  });

  it('diz que o prazo terminou e a quem pedir outro link', async () => {
    const carregar = vi.fn().mockResolvedValue({
      estado: 'expirado',
      documentoNome: 'Contrato de Aluguer',
      expirouEm: '2026-08-01T12:00:00Z',
    });

    renderPagina({ carregar, submeter: vi.fn() });

    expect(await screen.findByText(/prazo para assinar terminou/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^assinar/i })).not.toBeInTheDocument();
  });

  it('quando já foi assinado, mostra a data e deixa descarregar', async () => {
    const carregar = vi.fn().mockResolvedValue({
      estado: 'assinado',
      documentoNome: 'Contrato de Aluguer',
      assinadoEm: '2026-08-20T10:00:00Z',
      urlAssinado: 'https://exemplo.pt/assinado.pdf',
    });

    renderPagina({ carregar, submeter: vi.fn() });

    expect(await screen.findByText(/assinado a 20\/08\/2026/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /descarregar/i })).toHaveAttribute(
      'href',
      'https://exemplo.pt/assinado.pdf'
    );
  });

  it('avisa quando o link não existe', async () => {
    const carregar = vi.fn().mockRejectedValue(new Error('Pedido não encontrado.'));

    renderPagina({ carregar, submeter: vi.fn() });

    expect(await screen.findByText(/link não é válido/i)).toBeInTheDocument();
  });
});
