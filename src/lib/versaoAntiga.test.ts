import { describe, expect, it, vi } from 'vitest';

import { eErroDeVersaoAntiga, recarregarParaVersaoNova, renovarERecarregar } from './versaoAntiga';

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

describe('renovarERecarregar', () => {
  it('renova os ficheiros e só depois recarrega', async () => {
    const janela = janelaFalsa();
    const ordem: string[] = [];
    (janela.location.reload as ReturnType<typeof vi.fn>).mockImplementation(() =>
      ordem.push('recarregou')
    );
    const renovar = vi.fn(async () => void ordem.push('renovou'));
    const erro = new TypeError(
      'Failed to fetch dynamically imported module: https://wegest.pt/assets/A-1.js'
    );

    expect(renovarERecarregar(erro, janela, 1000, armazenamentoFalso(), renovar)).toBe(true);
    await vi.waitFor(() => expect(janela.location.reload).toHaveBeenCalled());
    expect(renovar).toHaveBeenCalledWith(erro);
    expect(ordem).toEqual(['renovou', 'recarregou']);
  });

  it('recarrega mesmo que a renovação falhe', async () => {
    const janela = janelaFalsa();
    const renovar = vi.fn(async () => {
      throw new Error('falhou');
    });
    renovarERecarregar(new Error('x'), janela, 1000, armazenamentoFalso(), renovar);
    await vi.waitFor(() => expect(janela.location.reload).toHaveBeenCalled());
  });

  it('não entra em ciclo: uma segunda tentativa dentro de 1 minuto não faz nada', async () => {
    const janela = janelaFalsa();
    const arm = armazenamentoFalso();
    const renovar = vi.fn(async () => undefined);
    expect(renovarERecarregar(new Error('x'), janela, 1000, arm, renovar)).toBe(true);
    expect(renovarERecarregar(new Error('x'), janela, 30_000, arm, renovar)).toBe(false);
    await vi.waitFor(() => expect(janela.location.reload).toHaveBeenCalledTimes(1));
    expect(renovar).toHaveBeenCalledTimes(1);
  });
});
