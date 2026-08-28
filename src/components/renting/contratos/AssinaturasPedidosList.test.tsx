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

  it('assinala um pedido cujo prazo passou sem assinatura', () => {
    render(
      <AssinaturasPedidosList
        pedidos={[{ ...porAssinar, expires_at: '2026-08-01T09:00:00Z' }]}
        agora={new Date('2026-08-25T12:00:00Z')}
      />
    );

    expect(screen.getByText(/prazo terminado/i)).toBeInTheDocument();
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
