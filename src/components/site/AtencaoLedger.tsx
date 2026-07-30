import { cn } from '@/lib/utils';
import { ATENCAO_ITENS, type AtencaoItem } from './content/landingContent';

const CORES_NIVEL: Record<AtencaoItem['nivel'], string> = {
  critico: 'bg-destructive',
  atencao: 'bg-warning',
  normal: 'bg-primary',
};

interface LinhaProps {
  item: AtencaoItem;
  /** Marca o elemento para o hook de reveal / para a timeline de convergência. */
  reveal?: boolean;
}

const Linha = ({ item, reveal = true }: LinhaProps) => (
  <li
    {...(reveal ? { 'data-reveal': '' } : {})}
    data-ledger-item={item.key}
    className="flex items-center gap-3 py-2.5 text-sm"
  >
    <span
      aria-hidden="true"
      className={cn('h-4 w-[3px] shrink-0 rounded-full', CORES_NIVEL[item.nivel])}
    />
    <span className="min-w-0 flex-1 truncate text-foreground">{item.titulo}</span>
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.prazo}</span>
  </li>
);

interface LedgerProps {
  titulo: string;
  /** Quantos itens mostrar. O hero mostra menos: é uma promessa, não um relatório. */
  limite?: number;
  className?: string;
  /** Desliga o `data-reveal` quando a animação é conduzida por outra timeline. */
  reveal?: boolean;
}

/**
 * O "livro de atenção" — o elemento-assinatura da página.
 *
 * O mesmo objeto aparece em três estados ao longo da landing:
 *  1. hero — calmo e ordenado: a promessa;
 *  2. reconhecimento — os mesmos itens dispersos (ver LedgerDisperso);
 *  3. a mudança — os fragmentos convergem de volta a esta forma, por scroll.
 *
 * Reutilizar literalmente o mesmo componente nos estados 1 e 3 é o que torna a
 * convergência legível: o visitante reconhece a forma a que chegou.
 */
export const AtencaoLedger = ({ titulo, limite, className, reveal = true }: LedgerProps) => {
  const itens = limite ? ATENCAO_ITENS.slice(0, limite) : ATENCAO_ITENS;

  return (
    <div
      className={cn(
        'w-full rounded-xl border border-border/70 bg-card/80 backdrop-blur-sm',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {titulo}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">{itens.length}</span>
      </div>
      <ul className="divide-y divide-border/40 px-4 py-1">
        {itens.map((item) => (
          <Linha key={item.key} item={item} reveal={reveal} />
        ))}
      </ul>
    </div>
  );
};

/**
 * Deslocamentos horizontais e opacidades por item, para o estado "disperso".
 * Fixos e não aleatórios: precisam de ser idênticos entre renders para que a
 * convergência da S4 parta sempre do mesmo sítio.
 */
const DISPERSAO = [
  { x: 'ml-0', opacity: 'opacity-100' },
  { x: 'ml-16', opacity: 'opacity-70' },
  { x: 'ml-6', opacity: 'opacity-90' },
  { x: 'ml-24', opacity: 'opacity-60' },
  { x: 'ml-10', opacity: 'opacity-80' },
];

/**
 * O mesmo conteúdo, desalinhado. A desordem visual é o argumento da secção de
 * reconhecimento — por isso não são cards nem uma grelha: uma grelha diria
 * "isto está organizado", que é exatamente o contrário do que se afirma.
 */
export const LedgerDisperso = ({ className }: { className?: string }) => (
  <ul className={cn('space-y-3', className)}>
    {ATENCAO_ITENS.map((item, index) => {
      const { x, opacity } = DISPERSAO[index % DISPERSAO.length];
      return (
        <li
          key={item.key}
          data-reveal
          data-ledger-fragmento={item.key}
          className={cn(
            'flex max-w-sm items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-sm',
            x,
            opacity
          )}
        >
          <span
            aria-hidden="true"
            className={cn('h-3.5 w-[3px] shrink-0 rounded-full', CORES_NIVEL[item.nivel])}
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.titulo}</span>
        </li>
      );
    })}
  </ul>
);
