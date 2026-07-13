import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandMenu } from './command-menu';

beforeAll(() => {
  // jsdom não implementa ResizeObserver; cmdk precisa dele
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('CommandMenu', () => {
  it('renderiza o dialog quando open=true', () => {
    render(
      <CommandMenu open={true} onOpenChange={vi.fn()}>
        <div>conteúdo</div>
      </CommandMenu>
    );

    // O CommandInput usa placeholder, não aria-label
    const input = screen.getByPlaceholderText('Pesquisar...');
    expect(input).toBeTruthy();
  });

  it('não renderiza o dialog quando open=false', () => {
    render(
      <CommandMenu open={false} onOpenChange={vi.fn()}>
        <div>conteúdo</div>
      </CommandMenu>
    );

    expect(screen.queryByPlaceholderText('Pesquisar...')).toBeNull();
  });

  it('mostra placeholder personalizado', () => {
    render(
      <CommandMenu
        open={true}
        onOpenChange={vi.fn()}
        placeholder="Saltar para..."
      >
        <div>conteúdo</div>
      </CommandMenu>
    );

    expect(screen.getByPlaceholderText('Saltar para...')).toBeTruthy();
  });

  it('mostra empty state quando não há children', () => {
    render(<CommandMenu open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Sem resultados')).toBeTruthy();
  });

  it('renderiza children (grupos) quando fornecidos', () => {
    render(
      <CommandMenu open={true} onOpenChange={vi.fn()}>
        <div data-testid="grupo-1">Grupo A</div>
        <div data-testid="grupo-2">Grupo B</div>
      </CommandMenu>
    );

    expect(screen.getByTestId('grupo-1')).toBeTruthy();
    expect(screen.getByTestId('grupo-2')).toBeTruthy();
  });

  it('chama onOpenChange(false) ao carregar Escape', () => {
    const onOpenChange = vi.fn();
    render(<CommandMenu open={true} onOpenChange={onOpenChange} />);

    // Escape fecha o dialog
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('abre/fecha com Cmd+K', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CommandMenu open={false} onOpenChange={onOpenChange} />
    );

    // Cmd+K com menu fechado → deve abrir
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);

    vi.clearAllMocks();

    // Cmd+K com menu aberto → deve fechar
    rerender(<CommandMenu open={true} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('abre/fecha com Ctrl+K', () => {
    const onOpenChange = vi.fn();
    render(<CommandMenu open={false} onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('não reage a teclas que não sejam K', () => {
    const onOpenChange = vi.fn();
    render(<CommandMenu open={false} onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'a', metaKey: true });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'k' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
