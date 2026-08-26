import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AssinarDocumento } from './AssinarDocumento';
import type { DocumentoSnapshot } from '@/utils/document-template/snapshot';

// gerarDeSnapshot é a costura entre "o que foi desenhado" e "o que vai no PDF"
// — mocká-la permite inspeccionar exactamente as chaves de assinatura que
// AssinarDocumento lhe passa, sem precisar de um jsPDF real.
const { gerarDeSnapshotMock } = vi.hoisted(() => ({ gerarDeSnapshotMock: vi.fn() }));
vi.mock('@/utils/document-template/snapshot', () => ({
  gerarDeSnapshot: gerarDeSnapshotMock,
}));
// Omissão sensata para os testes que não são sobre o próprio PDF — sem isto,
// eles rebentavam ao chamar `.output(...)` num mock sem resposta configurada.
gerarDeSnapshotMock.mockResolvedValue({ output: () => 'data:application/pdf;base64,AAA' });

// O canvas não desenha em jsdom (ver nota mais abaixo), e para testar a
// ligação entre o pad e a página — não o desenho em si — substitui-se o
// SignaturePad por um botão que simula um traço terminado. Cada render regista
// o `value` recebido, para se poder verificar se ele voltou a ser alimentado
// pelo próprio desenho.
const { valoresRecebidosPeloPad } = vi.hoisted(() => ({
  valoresRecebidosPeloPad: [] as Array<string | null | undefined>,
}));
vi.mock('@/components/assinatura/SignaturePad', () => ({
  SignaturePad: React.forwardRef((props: any, ref: any) => {
    valoresRecebidosPeloPad.push(props.value);
    React.useImperativeHandle(ref, () => ({
      clear: () => {},
      isEmpty: () => false,
      toDataURL: () => 'TRACO_NOVO',
    }));
    return (
      <button type="button" onClick={() => props.onChange?.(false)}>
        simular traço
      </button>
    );
  }),
}));

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

  /**
   * "O Condutor", na célula do template, não é uma pessoa à parte — é sempre
   * um cliente que conduz (rent-a-car) ou um motorista (TVDE/slot). É por
   * isso que {{motorista_nome}}, nessa mesma célula, já é preenchido a partir
   * de qualquer um dos dois (generateContratoPdf.ts). O marcador da
   * assinatura tem de seguir a mesma regra: {{assinatura_condutor}} preenche-
   * se com a assinatura de quem assinou, seja qual for a tabela de onde vem.
   */
  it('preenche assinatura_condutor junto da assinatura_cliente', async () => {
    const carregar = vi.fn().mockResolvedValue({
      estado: 'valido',
      documentoNome: 'Contrato de Aluguer',
      papel: 'cliente',
      signatarioNome: 'Ana Reis',
      expiraEm: '2026-09-24T12:00:00Z',
      snapshot: snapshotDeTeste,
    });

    renderPagina({
      carregar,
      submeter: vi.fn().mockResolvedValue(undefined),
      assinaturaInicial: TRACO,
    });

    await screen.findByText('Contrato de Aluguer');
    fireEvent.click(screen.getByRole('button', { name: /^assinar/i }));

    await waitFor(() => expect(gerarDeSnapshotMock).toHaveBeenCalled());
    expect(gerarDeSnapshotMock).toHaveBeenCalledWith(
      snapshotDeTeste,
      expect.objectContaining({ assinatura_cliente: TRACO, assinatura_condutor: TRACO })
    );
  });

  it('preenche assinatura_condutor também quando quem assina é o motorista', async () => {
    const carregar = vi.fn().mockResolvedValue({
      estado: 'valido',
      documentoNome: 'Contrato TVDE',
      papel: 'motorista',
      signatarioNome: 'Rui Dias',
      expiraEm: '2026-09-24T12:00:00Z',
      snapshot: snapshotDeTeste,
    });

    renderPagina({
      carregar,
      submeter: vi.fn().mockResolvedValue(undefined),
      assinaturaInicial: TRACO,
    });

    await screen.findByText('Contrato TVDE');
    fireEvent.click(screen.getByRole('button', { name: /^assinar/i }));

    await waitFor(() => expect(gerarDeSnapshotMock).toHaveBeenCalled());
    expect(gerarDeSnapshotMock).toHaveBeenCalledWith(
      snapshotDeTeste,
      expect.objectContaining({ assinatura_motorista: TRACO, assinatura_condutor: TRACO })
    );
  });

  /**
   * O SignaturePad já existia para a entrega/recolha, e nunca ali alimentou o
   * seu próprio `onChange` de volta em `value` (AssinaturasHandoverSection.tsx
   * usa-o sem `value`, ou com um valor fixo vindo de fora). Esta página foi a
   * primeira a fazer esse ciclo — e o `useEffect` do SignaturePad que reage a
   * `value` limpa o canvas sempre que ela muda. O resultado real: a meio de
   * um traço, o canvas é limpo e recarregado com o instantâneo que acabou de
   * sair de lá, interrompendo a assinatura.
   */
  it('não realimenta o traço desenhado de volta no pad', async () => {
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

    const antesDoClique = valoresRecebidosPeloPad.length;
    fireEvent.click(screen.getByRole('button', { name: /simular traço/i }));

    // O botão de assinar activa-se — a assinatura existe do lado da página.
    await waitFor(() => expect(screen.getByRole('button', { name: /^assinar/i })).toBeEnabled());

    // Mas nenhum render do pad, desde o clique, pode ter recebido de volta o
    // valor que ele próprio acabou de produzir.
    const depoisDoClique = valoresRecebidosPeloPad.slice(antesDoClique);
    expect(depoisDoClique).not.toContain('TRACO_NOVO');
  });
});
