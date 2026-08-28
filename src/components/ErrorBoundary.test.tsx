import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { ErrorBoundary, RouteErrorBoundary } from './ErrorBoundary';

/**
 * Antes destes testes existirem, um erro de render em qualquer componente levava
 * a aplicação inteira a ecrã branco. O que se fixa aqui não é o desenho do ecrã
 * de erro — é o contrato: **o erro fica contido, e há sempre saída**.
 *
 * O React escreve o erro na consola mesmo quando ele é apanhado. Silencia-se
 * durante os testes que provocam erros de propósito, senão a saída fica cheia de
 * ruído que parece falha.
 */

function Rebenta({ deve = true }: { deve?: boolean }): JSX.Element {
  if (deve) throw new Error('erro de propósito');
  return <p>conteúdo recuperado</p>;
}

let consoleErro: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErro = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErro.mockRestore();
});

describe('ErrorBoundary', () => {
  it('deixa passar os filhos quando não há erro', () => {
    render(
      <ErrorBoundary>
        <p>tudo bem</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('tudo bem')).toBeInTheDocument();
  });

  it('mostra o ecrã de erro em vez de deixar a árvore rebentar', () => {
    render(
      <ErrorBoundary>
        <Rebenta />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/não conseguiu abrir/i)).toBeInTheDocument();
  });

  /**
   * CONTROLO NEGATIVO. Sem a fronteira, o mesmo componente faz o `render`
   * lançar. Se algum dia esta expectativa deixar de falhar, é sinal de que o
   * componente de teste deixou de rebentar — e os testes acima passam a estar a
   * validar coisa nenhuma.
   */
  it('sem fronteira, o mesmo componente derruba o render', () => {
    expect(() => render(<Rebenta />)).toThrow('erro de propósito');
  });

  it('nunca mostra a stack trace ao utilizador', () => {
    render(
      <ErrorBoundary>
        <Rebenta />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/at Rebenta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/componentStack/i)).not.toBeInTheDocument();
  });

  it('oferece as duas saídas: tentar de novo e voltar ao início', () => {
    render(
      <ErrorBoundary>
        <Rebenta />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voltar ao início/i })).toBeInTheDocument();
  });

  it('"tentar de novo" recupera quando a causa desapareceu', () => {
    function Cenario() {
      const [deve, setDeve] = useState(true);
      return (
        <>
          <button onClick={() => setDeve(false)}>corrigir causa</button>
          <ErrorBoundary>
            <Rebenta deve={deve} />
          </ErrorBoundary>
        </>
      );
    }

    render(<Cenario />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // A causa deixa de existir; só depois é que "tentar de novo" faz sentido.
    fireEvent.click(screen.getByRole('button', { name: /corrigir causa/i }));
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(screen.getByText('conteúdo recuperado')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('regista o erro com a origem, para se saber onde rebentou', () => {
    render(
      <ErrorBoundary origem="ecrã de teste">
        <Rebenta />
      </ErrorBoundary>
    );

    const registou = consoleErro.mock.calls.some((args) =>
      String(args[0]).includes('ecrã de teste')
    );
    expect(registou).toBe(true);
  });

  it('aceita um ecrã alternativo para secções pequenas', () => {
    render(
      <ErrorBoundary fallback={({ erro }) => <p>falhou: {erro.message}</p>}>
        <Rebenta />
      </ErrorBoundary>
    );
    expect(screen.getByText('falhou: erro de propósito')).toBeInTheDocument();
  });
});

describe('RouteErrorBoundary', () => {
  /**
   * O comportamento que mais importa e o mais fácil de perder num refactor:
   * navegar para outra rota limpa o erro. Sem isto o utilizador fica preso no
   * ecrã de erro mesmo depois de clicar noutra entrada do menu — que é
   * exactamente o momento em que o produto parece partido.
   */
  it('limpa o erro ao navegar para outra rota', () => {
    render(
      <MemoryRouter initialEntries={['/parte']}>
        <nav>
          <Link to="/sa">ir para a página sã</Link>
        </nav>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/parte" element={<Rebenta />} />
            <Route path="/sa" element={<p>página sã</p>} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /página sã/i }));

    expect(screen.getByText('página sã')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mantém a navegação utilizável enquanto a rota está em erro', () => {
    render(
      <MemoryRouter initialEntries={['/parte']}>
        <nav>
          <Link to="/sa">menu lateral</Link>
        </nav>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/parte" element={<Rebenta />} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>
    );

    // O erro está contido: o que está fora da fronteira continua a renderizar.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /menu lateral/i })).toBeInTheDocument();
  });
});
