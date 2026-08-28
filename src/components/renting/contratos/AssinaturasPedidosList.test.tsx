import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AssinaturasPedidosList } from './AssinaturasPedidosList';
import type { AssinaturaPedido } from '@/hooks/useAssinaturaPedidos';

/**
 * A lista existe para responder a uma pergunta: "já assinou?".
 *
 * O que se testa aqui é sobretudo o que a lista **não** pode dizer. Não temos
 * como saber se um email chegou à caixa de correio de alguém — o webhook do
 * Brevo não está ligado — por isso escrever "entregue" seria mentir a quem está
 * a olhar para o ecrã e a decidir se telefona ao cliente.
 */

const porAssinar: AssinaturaPedido = {
  id: 'p1',
  papel: 'cliente',
  signatario_nome: 'Ana Reis',
  signatario_email: 'ana@exemplo.pt',
  documento_nome: 'Contrato de Aluguer',
  created_at: '2026-08-25T09:00:00Z',
  expires_at: '2026-09-24T09:00:00Z',
  assinado_em: null,
  assinaturas_total: 0,
  documento_path: 'assinaturas/2026-08-25/documento.pdf',
  documento_assinado_path: null,
  de_versao_anterior: false,
};

describe('AssinaturasPedidosList', () => {
  it('diz enviado, nunca entregue', () => {
    render(<AssinaturasPedidosList pedidos={[porAssinar]} />);

    expect(screen.getByText(/enviado a 25\/08\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/por assinar/i)).toBeInTheDocument();
    expect(screen.queryByText(/entregue/i)).not.toBeInTheDocument();
  });

  it('mostra a data quando já foi assinado', () => {
    render(
      <AssinaturasPedidosList
        pedidos={[
          {
            ...porAssinar,
            assinado_em: '2026-08-26T14:30:00Z',
            documento_assinado_path: 'assinaturas/assinados/p1/documento-assinado.pdf',
          },
        ]}
      />
    );

    expect(screen.getByText(/assinado a 26\/08\/2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /documento assinado/i })).toBeInTheDocument();
  });

  // O link deixou de ter prazo: um pedido antigo por assinar continua a dizer
  // "por assinar", e nao "prazo terminado", porque continua mesmo a poder ser
  // assinado.
  it('um pedido antigo por assinar continua por assinar, sem falar em prazos', () => {
    render(
      <AssinaturasPedidosList pedidos={[{ ...porAssinar, created_at: '2025-01-01T09:00:00Z' }]} />
    );

    expect(screen.getByText(/por assinar/i)).toBeInTheDocument();
    expect(screen.queryByText(/prazo/i)).toBeNull();
  });

  it('diz quantas assinaturas houve quando foi assinado mais do que uma vez', () => {
    render(
      <AssinaturasPedidosList
        pedidos={[
          {
            ...porAssinar,
            assinado_em: '2026-08-26T10:00:00Z',
            assinaturas_total: 3,
            documento_assinado_path: 'x/documento-assinado.pdf',
          },
        ]}
      />
    );

    expect(screen.getByText(/3\.ª assinatura/)).toBeInTheDocument();
  });

  it('não ocupa o ecrã quando não há pedidos', () => {
    const { container } = render(<AssinaturasPedidosList pedidos={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o papel de cada pessoa, para distinguir dois pedidos à mesma', () => {
    render(
      <AssinaturasPedidosList
        pedidos={[porAssinar, { ...porAssinar, id: 'p2', papel: 'condutor' }]}
      />
    );

    expect(screen.getByText(/\(cliente\)/i)).toBeInTheDocument();
    expect(screen.getByText(/\(condutor\)/i)).toBeInTheDocument();
  });

  it('abre o documento assinado pelo link temporário', async () => {
    const abrir = vi.fn().mockResolvedValue('https://exemplo.pt/assinado.pdf');
    const janela = vi.fn();

    render(
      <AssinaturasPedidosList
        pedidos={[
          {
            ...porAssinar,
            assinado_em: '2026-08-26T14:30:00Z',
            documento_assinado_path: 'caminho/doc.pdf',
          },
        ]}
        obterUrl={abrir}
        abrirUrl={janela}
      />
    );

    screen.getByRole('button', { name: /documento assinado/i }).click();

    await vi.waitFor(() => expect(abrir).toHaveBeenCalledWith('caminho/doc.pdf'));
    await vi.waitFor(() => expect(janela).toHaveBeenCalledWith('https://exemplo.pt/assinado.pdf'));
  });
});

/**
 * Reverter um contrato para reserva e voltar a criá-lo faz nascer uma LINHA
 * nova, com o mesmo número. Os pedidos ficam agarrados à linha onde foram
 * feitos — e sem estes testes um documento já assinado desaparecia do ecrã.
 * Aconteceu ao contrato 841 da matrícula 00-62-VF: quatro linhas, assinaturas
 * em três delas, e a aba só mostrava a da linha viva, por assinar.
 */
describe('AssinaturasPedidosList — pedidos de versões anteriores', () => {
  const assinadoAntes: AssinaturaPedido = {
    id: 'p-antigo',
    papel: 'cliente',
    signatario_nome: 'Dinis Silva',
    signatario_email: 'dinis@exemplo.pt',
    documento_nome: 'Contrato de Aluguer 841',
    created_at: '2026-08-28T14:31:00Z',
    expires_at: '2026-09-27T14:31:00Z',
    assinado_em: '2026-08-28T14:32:00Z',
    assinaturas_total: 1,
    documento_path: 'assinaturas/2026-08-28/documento.pdf',
    documento_assinado_path: 'contratos/841/documento-assinado.pdf',
    de_versao_anterior: true,
  };

  it('mostra um pedido assinado numa versão anterior, em vez de o esconder', () => {
    render(<AssinaturasPedidosList pedidos={[assinadoAntes]} />);

    expect(screen.getByText('Contrato de Aluguer 841')).toBeTruthy();
    expect(screen.getByText(/Assinado a/)).toBeTruthy();
  });

  it('assinala-o como sendo de uma versão anterior', () => {
    render(<AssinaturasPedidosList pedidos={[assinadoAntes]} />);

    expect(screen.getByText('Versão anterior do contrato')).toBeTruthy();
  });

  // Continua a poder descarregar-se: o documento existe e é prova do que foi
  // assinado, mesmo que o contrato tenha sido refeito depois.
  it('deixa descarregar o documento assinado da versão anterior', () => {
    render(<AssinaturasPedidosList pedidos={[assinadoAntes]} />);

    expect(screen.getByRole('button', { name: /Documento assinado/ })).toBeTruthy();
  });

  it('não marca como versão anterior um pedido do contrato actual', () => {
    render(<AssinaturasPedidosList pedidos={[{ ...assinadoAntes, de_versao_anterior: false }]} />);

    expect(screen.queryByText('Versão anterior do contrato')).toBeNull();
  });
});

/**
 * Ver o original e o assinado lado a lado. Ambos sao PDF e abrem num separador,
 * que e de onde se imprime ou se guarda.
 */
describe('AssinaturasPedidosList — original e assinado', () => {
  it('deixa abrir o original mesmo antes de estar assinado', async () => {
    const obterUrl = vi.fn().mockResolvedValue('https://exemplo/original.pdf');
    const abrirUrl = vi.fn();
    render(
      <AssinaturasPedidosList pedidos={[porAssinar]} obterUrl={obterUrl} abrirUrl={abrirUrl} />
    );

    screen.getByRole('button', { name: /Original/ }).click();

    await vi.waitFor(() => expect(abrirUrl).toHaveBeenCalledWith('https://exemplo/original.pdf'));
    expect(obterUrl).toHaveBeenCalledWith('assinaturas/2026-08-25/documento.pdf');
  });

  it('num pedido assinado oferece os dois documentos', () => {
    const assinado: AssinaturaPedido = {
      ...porAssinar,
      id: 'p-assinado',
      assinado_em: '2026-08-26T10:00:00Z',
      documento_assinado_path: 'assinaturas/2026-08-25/documento-assinado.pdf',
    };
    render(<AssinaturasPedidosList pedidos={[assinado]} />);

    expect(screen.getByRole('button', { name: /Original/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Documento assinado/ })).toBeTruthy();
  });

  it('abre o assinado, e nao o original, no botao do assinado', async () => {
    const obterUrl = vi.fn().mockResolvedValue('https://exemplo/assinado.pdf');
    const abrirUrl = vi.fn();
    const assinado: AssinaturaPedido = {
      ...porAssinar,
      id: 'p-assinado',
      assinado_em: '2026-08-26T10:00:00Z',
      documento_assinado_path: 'assinaturas/2026-08-25/documento-assinado.pdf',
    };
    render(<AssinaturasPedidosList pedidos={[assinado]} obterUrl={obterUrl} abrirUrl={abrirUrl} />);

    screen.getByRole('button', { name: /Documento assinado/ }).click();

    await vi.waitFor(() => expect(abrirUrl).toHaveBeenCalled());
    expect(obterUrl).toHaveBeenCalledWith('assinaturas/2026-08-25/documento-assinado.pdf');
  });
});
