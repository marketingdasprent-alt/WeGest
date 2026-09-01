import { cn } from '@/lib/utils';
import type { ContagemDeModulo } from './agrupamento';
import { TODOS_OS_MODULOS } from './rotulos';

/**
 * O filtro por módulo, em chips com a cor do módulo.
 *
 * Substitui um `<Select>` de 176px que dizia "Módulo" e escondia atrás de um
 * clique tanto os módulos que existem como quantas regras cada um tem. Aqui
 * está tudo à vista — e a cor é a mesma que o canvas usa para o mesmo módulo,
 * o que antes não acontecia.
 *
 * ── A COR NUNCA É O ÚNICO SINAL ─────────────────────────────────────────────
 *
 * Cada chip leva o nome escrito e a contagem. Quem não distingue as matizes lê
 * exactamente a mesma informação; a cor acelera para quem a vê, não substitui
 * nada. O estado activo também não é só cor: é `aria-pressed`, e o fundo
 * tingido é acompanhado de borda.
 *
 * As cores entram por `style` e não por classes do Tailwind porque o token
 * varia por módulo — `bg-[hsl(var(--fluxo-viaturas))]` teria de existir como
 * classe literal para cada um dos oito, e o Tailwind não gera classes a partir
 * de variáveis.
 */
export function ChipsDeModulo({
  contagens,
  valor,
  onEscolher,
  total,
}: {
  contagens: ContagemDeModulo[];
  /** A chave do módulo escolhido, ou `TODOS_OS_MODULOS`. */
  valor: string;
  onEscolher: (chave: string) => void;
  /** Quantas regras existem ao todo — o número do chip "Todas". */
  total: number;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar automações por módulo"
      className="flex flex-wrap items-center gap-1.5"
    >
      <Chip
        activo={valor === TODOS_OS_MODULOS}
        nome="Todas"
        contagem={total}
        onClick={() => onEscolher(TODOS_OS_MODULOS)}
      />

      {contagens.map(({ modulo, total: n }) => (
        <Chip
          key={modulo.chave}
          activo={valor === modulo.chave}
          nome={modulo.nome}
          contagem={n}
          token={modulo.token}
          onClick={() => onEscolher(modulo.chave)}
        />
      ))}
    </div>
  );
}

function Chip({
  activo,
  nome,
  contagem,
  token,
  onClick,
}: {
  activo: boolean;
  nome: string;
  contagem: number;
  /** Ausente no chip "Todas": não é um módulo, não tem cor própria. */
  token?: string;
  onClick: () => void;
}) {
  const cor = token ? `hsl(var(${token}))` : undefined;

  // Sem isto o nome acessível saía "Financeiro1" — o nome e a contagem são nós
  // de texto encostados, e um leitor de ecrã lê-os colados.
  const rotulo = `${nome}, ${contagem === 1 ? '1 automação' : `${contagem} automações`}`;

  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={activo}
      onClick={onClick}
      style={
        activo && token
          ? {
              color: cor,
              backgroundColor: `hsl(var(${token}) / 0.12)`,
              borderColor: `hsl(var(${token}) / 0.45)`,
            }
          : undefined
      }
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        activo && !token && 'border-foreground/30 bg-foreground/10 text-foreground',
        !activo && 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {token && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: cor }}
        />
      )}
      {nome}
      <span className="tabular-nums opacity-70">{contagem}</span>
    </button>
  );
}
