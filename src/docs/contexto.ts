// Contexto do site da documentação: base dos links e linguagem dos exemplos.
import { createContext, useContext } from 'react';
import type { Linguagem } from './lib/exemplosCodigo';

export interface ContextoDocs {
  base: '' | '/docs';
  linguagem: Linguagem;
  escolherLinguagem: (l: Linguagem) => void;
}

export const DocsContexto = createContext<ContextoDocs>({
  base: '/docs',
  linguagem: 'curl',
  escolherLinguagem: () => undefined,
});

export const useDocs = () => useContext(DocsContexto);
