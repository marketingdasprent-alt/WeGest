import type { LucideIcon } from 'lucide-react';

/**
 * Identidade do passo no topo do painel: ícone com a cor da categoria, o tipo
 * em letra pequena e o nome. É o que diz ao utilizador o que está a editar sem
 * ele ter de voltar ao canvas.
 */
const ETIQUETA: Record<string, string> = {
  trigger: 'Gatilho',
  condicao: 'Condição',
  accao: 'Ação',
  erro: 'Falha',
};

export function CabecalhoDoPasso({
  cor,
  Icone,
  tipo,
  nome,
}: {
  cor: string;
  Icone: LucideIcon;
  tipo: string;
  nome: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `hsl(var(${cor}) / 0.15)`, color: `hsl(var(${cor}))` }}
        aria-hidden="true"
      >
        <Icone className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {ETIQUETA[tipo] ?? 'Passo'}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{nome || 'Sem nome'}</p>
      </div>
    </div>
  );
}
