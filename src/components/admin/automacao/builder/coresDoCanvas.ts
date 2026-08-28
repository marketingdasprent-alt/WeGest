import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Cores do canvas para os componentes do React Flow que as recebem por prop.
 *
 * `Background`, `MiniMap` e os marcadores de seta das ligações são desenhados
 * em SVG com atributos calculados em JavaScript — não lêem variáveis CSS. Ler
 * o valor computado e voltar a lê-lo quando o tema muda é o que os impede de
 * ficar com a cor do modo anterior.
 */

export const TOKENS_DO_CANVAS = {
  grelha: '--grid-dot',
  aresta: '--edge',
  painel: '--panel-bg',
  no: '--node-bg',
  borda: '--node-border',
} as const;

export type CoresDoCanvas = Record<keyof typeof TOKENS_DO_CANVAS, string>;

/** Usados enquanto o CSS não está montado, e em ambientes sem layout (testes). */
const RECURSO: CoresDoCanvas = {
  grelha: 'hsl(0 0% 83%)',
  aresta: 'hsl(0 0% 62%)',
  painel: 'hsl(0 0% 100%)',
  no: 'hsl(0 0% 100%)',
  borda: 'hsl(0 0% 87%)',
};

/**
 * Converte o valor cru de uma custom property numa cor utilizável.
 *
 * Os tokens do projecto guardam só os três componentes ("222 47% 6%") para
 * poderem levar alfa (`hsl(var(--x) / 0.2)`), por isso é preciso embrulhar.
 */
export function hslDoToken(valor: string, recurso: string): string {
  const limpo = valor.trim();
  if (!limpo) return recurso;
  // Já é uma cor completa — embrulhar outra vez dava hsl(hsl(...)).
  if (limpo.startsWith('#') || limpo.includes('(')) return limpo;
  return `hsl(${limpo})`;
}

function lerCores(): CoresDoCanvas {
  if (typeof window === 'undefined') return RECURSO;
  const estilo = getComputedStyle(document.documentElement);
  const lido = {} as CoresDoCanvas;
  for (const [nome, token] of Object.entries(TOKENS_DO_CANVAS)) {
    const chave = nome as keyof CoresDoCanvas;
    lido[chave] = hslDoToken(estilo.getPropertyValue(token), RECURSO[chave]);
  }
  return lido;
}

export function useCoresDoCanvas(): CoresDoCanvas {
  const { resolvedTheme } = useTheme();
  const [cores, setCores] = useState<CoresDoCanvas>(RECURSO);

  useEffect(() => {
    // Depois da pintura: a classe `.dark` é trocada no <html> pelo next-themes,
    // e ler antes disso devolvia os valores do tema anterior.
    const id = requestAnimationFrame(() => setCores(lerCores()));
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);

  return cores;
}
