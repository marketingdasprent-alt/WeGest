import { describe, expect, it, vi } from 'vitest';

import { eErroDeVersaoAntiga, recarregarParaVersaoNova } from './versaoAntiga';

function armazenamentoFalso(): Storage {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

const janelaFalsa = () => ({ location: { reload: vi.fn() } }) as unknown as Window;

describe('eErroDeVersaoAntiga', () => {
  it('reconhece os erros de ficheiro em falta do Chrome, Firefox e Safari', () => {
    expect(
      eErroDeVersaoAntiga(
        new TypeError(
          'Failed to fetch dynamically imported module: https://www.wegest.pt/assets/Faturacao-x.js'
        )
      )
    ).toBe(true);
    expect(eErroDeVersaoAntiga(new Error('error loading dynamically imported module'))).toBe(true);
    expect(eErroDeVersaoAntiga(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(eErroDeVersaoAntiga(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true);
  });

  it('não confunde erros normais com versão antiga', () => {
    expect(
      eErroDeVersaoAntiga(new TypeError("Cannot read properties of undefined (reading 'x')"))
    ).toBe(false);
    expect(eErroDeVersaoAntiga(null)).toBe(false);
    expect(eErroDeVersaoAntiga({ message: 'Failed to fetch dynamically imported module' })).toBe(
      false
    );
  });
});

describe('recarregarParaVersaoNova', () => {
  it('recarrega à primeira', () => {
    const janela = janelaFalsa();
    expect(recarregarParaVersaoNova(janela, 1_000, armazenamentoFalso())).toBe(true);
    expect(janela.location.reload).toHaveBeenCalledTimes(1);
  });

  it('não entra em ciclo: segunda tentativa no mesmo minuto não recarrega', () => {
    const janela = janelaFalsa();
    const arm = armazenamentoFalso();
    recarregarParaVersaoNova(janela, 1_000, arm);
    expect(recarregarParaVersaoNova(janela, 30_000, arm)).toBe(false);
    expect(janela.location.reload).toHaveBeenCalledTimes(1);
  });

  it('um deploy mais tarde volta a poder recarregar', () => {
    const janela = janelaFalsa();
    const arm = armazenamentoFalso();
    recarregarParaVersaoNova(janela, 1_000, arm);
    expect(recarregarParaVersaoNova(janela, 120_000, arm)).toBe(true);
    expect(janela.location.reload).toHaveBeenCalledTimes(2);
  });
});
