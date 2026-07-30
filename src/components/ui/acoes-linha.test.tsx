import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Eye, Pencil, Trash2 } from 'lucide-react';

import { AcoesLinha } from './acoes-linha';

describe('AcoesLinha', () => {
  it('cada acção é encontrável pelo nome, não pelo ícone', () => {
    // É este o ponto do componente: antes, estes botões eram todos "botão" para
    // um leitor de ecrã (e para um teste).
    render(
      <AcoesLinha
        acoes={[
          { icone: Eye, rotulo: 'Ver viatura AA-00-BB', onClick: vi.fn() },
          { icone: Pencil, rotulo: 'Editar viatura AA-00-BB', onClick: vi.fn() },
          {
            icone: Trash2,
            rotulo: 'Eliminar viatura AA-00-BB',
            onClick: vi.fn(),
            destrutiva: true,
          },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'Ver viatura AA-00-BB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar viatura AA-00-BB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar viatura AA-00-BB' })).toBeTruthy();
  });

  it('chama o onClick da acção tocada', () => {
    const editar = vi.fn();
    const eliminar = vi.fn();
    render(
      <AcoesLinha
        acoes={[
          { icone: Pencil, rotulo: 'Editar', onClick: editar },
          { icone: Trash2, rotulo: 'Eliminar', onClick: eliminar, destrutiva: true },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(eliminar).toHaveBeenCalledTimes(1);
    expect(editar).not.toHaveBeenCalled();
  });

  it('o ícone é decorativo — o nome não vem dele', () => {
    const { container } = render(
      <AcoesLinha acoes={[{ icone: Pencil, rotulo: 'Editar', onClick: vi.fn() }]} />
    );
    // Sem aria-hidden, o leitor de ecrã podia anunciar o svg além do rótulo.
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('acção oculta não é renderizada (permissões)', () => {
    render(
      <AcoesLinha
        acoes={[
          { icone: Pencil, rotulo: 'Editar', onClick: vi.fn() },
          { icone: Trash2, rotulo: 'Eliminar', onClick: vi.fn(), oculta: true },
        ]}
      />
    );
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
  });

  it('não renderiza nada quando todas as acções estão ocultas', () => {
    // Senão sobrava um <div> vazio a ocupar espaço na célula.
    const { container } = render(
      <AcoesLinha acoes={[{ icone: Pencil, rotulo: 'Editar', onClick: vi.fn(), oculta: true }]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('pararPropagacao impede que o clique chegue à linha', () => {
    // Sem isto, tocar em "Eliminar" numa linha clicável eliminava E navegava.
    const cliqueNaLinha = vi.fn();
    const eliminar = vi.fn();
    render(
      <tbody>
        {/* Linha clicável de propósito: é o cenário que o pararPropagacao existe
            para resolver. */}
        <tr onClick={cliqueNaLinha}>
          <td>
            <AcoesLinha
              pararPropagacao
              acoes={[{ icone: Trash2, rotulo: 'Eliminar', onClick: eliminar }]}
            />
          </td>
        </tr>
      </tbody>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(eliminar).toHaveBeenCalledTimes(1);
    expect(cliqueNaLinha).not.toHaveBeenCalled();
  });

  it('sem pararPropagacao o clique sobe, como acontecia antes', () => {
    // O comportamento anterior variava de sítio para sítio; o componente não
    // pode passar a parar a propagação onde ninguém a parava.
    const cliqueNaLinha = vi.fn();
    render(
      // Igual ao teste anterior: montagem, não produção.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={cliqueNaLinha}>
        <AcoesLinha acoes={[{ icone: Pencil, rotulo: 'Editar', onClick: vi.fn() }]} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(cliqueNaLinha).toHaveBeenCalledTimes(1);
  });
});
