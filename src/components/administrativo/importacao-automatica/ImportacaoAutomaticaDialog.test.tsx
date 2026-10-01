import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutate = vi.fn();
const reset = vi.fn();
let estadoExecutar: { isPending: boolean; isSuccess: boolean; data?: unknown[] };
let lote: Record<string, unknown>;

vi.mock('@/hooks/useImportacaoAutomatica', () => ({
  useContasImportacao: () => ({ data: [], isLoading: false }),
  useExecutarImportacao: () => ({ ...estadoExecutar, mutate, reset }),
}));
vi.mock('@/hooks/useLoteImportacao', () => ({ useLoteImportacao: () => lote }));

import { ImportacaoAutomaticaDialog } from './ImportacaoAutomaticaDialog';

const linha = {
  chave: 'a',
  nome: '20260921-20260927-UBER URBANGO.csv',
  plataforma: 'uber',
  contaId: 'urbango',
  periodo: { inicio: '2026-09-21', fim: '2026-09-27' },
  motivo: 'Detectada.',
  falta: null,
  substitui: false,
  repetido: false,
};

const abrir = (props: Partial<Parameters<typeof ImportacaoAutomaticaDialog>[0]> = {}) =>
  render(<ImportacaoAutomaticaDialog open onOpenChange={vi.fn()} {...props} />);

describe('ImportacaoAutomaticaDialog', () => {
  beforeEach(() => {
    mutate.mockReset();
    estadoExecutar = { isPending: false, isSuccess: false };
    lote = {
      linhas: [linha],
      faltas: [],
      adicionar: vi.fn(),
      retirar: vi.fn(),
      escolher: vi.fn(),
      limpar: vi.fn(),
      pedidos: () => [{ chave: 'a' }],
      pronto: true,
      analisando: false,
      erroAnalise: null,
    };
  });

  it('lote pronto: importa os pedidos', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 ficheiro' }));
    expect(mutate).toHaveBeenCalledWith([{ chave: 'a' }]);
  });

  it('lote por resolver: o botão fica bloqueado', () => {
    lote = { ...lote, pronto: false };
    abrir();
    expect(
      (screen.getByRole('button', { name: 'Importar 1 ficheiro' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('no fim, "Concluir" recarrega o resumo', () => {
    estadoExecutar = { isPending: false, isSuccess: true, data: [] };
    const onImportComplete = vi.fn();
    const onOpenChange = vi.fn();
    abrir({ onImportComplete, onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(onImportComplete).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('explica que reimportar substitui', () => {
    abrir();
    expect(screen.getByText(/substitui os dados dela, nunca soma/)).not.toBeNull();
  });
});
