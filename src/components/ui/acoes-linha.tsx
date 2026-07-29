import * as React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Acções de uma linha de tabela ou de um cartão de lista.
 *
 * PORQUE ISTO EXISTE
 * O trio ver/editar/eliminar em botões só-com-ícone estava copiado à mão em ~20
 * ficheiros, e em nenhum deles os botões tinham nome acessível: ao leitor de
 * ecrã eram todos "botão". Eram ~55 dos 185 controlos sem nome — um quarto do
 * problema numa única forma repetida.
 *
 * `rotulo` é OBRIGATÓRIO, e é aí que está o valor: não é possível acrescentar
 * uma acção de linha sem nome sem que o TypeScript recuse. Uma regra de lint não
 * conseguia garantir isto (o ESLint não vê de forma fiável o conteúdo dos filhos
 * de um elemento JSX); o tipo garante.
 *
 * O rótulo serve de `aria-label` e de `title`: quem não vê o ecrã ouve-o, e quem
 * vê passa o rato por cima e deixa de ter de adivinhar o ícone.
 */
export interface AcaoLinha {
  /** Ícone lucide. Decorativo (`aria-hidden`) — quem dá o nome é o rótulo. */
  icone: LucideIcon;
  /**
   * O que a acção faz, na perspectiva de quem a usa. Inclui o alvo quando isso
   * evita ambiguidade numa lista: "Eliminar viatura AA-00-BB" em vez de
   * "Eliminar".
   */
  rotulo: string;
  onClick: () => void;
  /** Vermelho. A confirmação continua a cargo de quem chama. */
  destrutiva?: boolean;
  desativada?: boolean;
  /** Troca o ícone por um spinner sem perder o nome acessível. */
  aCarregar?: boolean;
  /**
   * Não renderiza a acção. Para permissões: `oculta: !podeEliminar`, que lê
   * melhor do que envolver cada botão num `&&`.
   */
  oculta?: boolean;
}

interface AcoesLinhaProps {
  acoes: AcaoLinha[];
  /** `fim` alinha à direita, como é hábito na última coluna de uma tabela. */
  alinhamento?: 'inicio' | 'fim';
  /** Botões de 32px (h-8 w-8), como já usavam várias tabelas mais densas. */
  compacto?: boolean;
  /**
   * Impede que o clique chegue à linha. Só quando a própria linha é clicável —
   * fica explícito em vez de implícito, para não alterar o comportamento de
   * quem não o tinha.
   */
  pararPropagacao?: boolean;
  className?: string;
}

export function AcoesLinha({
  acoes,
  alinhamento = 'inicio',
  compacto = false,
  pararPropagacao = false,
  className,
}: AcoesLinhaProps) {
  const visiveis = acoes.filter((a) => !a.oculta);
  if (visiveis.length === 0) return null;

  return (
    <div
      className={cn('flex items-center gap-1', alinhamento === 'fim' && 'justify-end', className)}
      onClick={pararPropagacao ? (e) => e.stopPropagation() : undefined}
      role={pararPropagacao ? 'presentation' : undefined}
    >
      {visiveis.map((acao) => {
        const Icone = acao.aCarregar ? Loader2 : acao.icone;
        return (
          <Button
            key={acao.rotulo}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={acao.rotulo}
            title={acao.rotulo}
            disabled={acao.desativada || acao.aCarregar}
            onClick={acao.onClick}
            className={cn(
              compacto && 'h-8 w-8',
              acao.destrutiva && 'text-destructive hover:text-destructive'
            )}
          >
            <Icone className={cn('h-4 w-4', acao.aCarregar && 'animate-spin')} aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
