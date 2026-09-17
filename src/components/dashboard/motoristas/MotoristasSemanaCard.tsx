import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMotoristasSemana } from '@/hooks/useMotoristasSemana';
import {
  formatarEuros,
  formatarIntervaloSemana,
  percentagem,
  type GestorContagem,
  type MotoristaNegativo,
} from './motoristasSemana';

/** O cartão preenche a altura que a linha lhe dá (a homepage está desenhada
 *  para caber num ecrã, e essa altura é fixada em DashboardFrota). Abaixo de
 *  `lg` a página rola na mesma e o cartão cresce com o conteúdo. */
const ALTURA = 'lg:h-full';

function NegativoRow({ motorista, onClick }: { motorista: MotoristaNegativo; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] leading-tight">{motorista.nome}</span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-destructive">
        {formatarEuros(motorista.liquido)}
      </span>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
    </button>
  );
}

/** Nome, barra e número em três colunas fixas. O preenchimento atrás do nome
 *  (que isto substitui) fazia as barras começarem todas em sítios diferentes e
 *  o texto assentar em cima da cor: dois valores próximos eram indistinguíveis.
 *  Com a barra em coluna própria, todas arrancam do mesmo x e comparam-se de
 *  relance. */
function GestorRow({ gestor, maximo }: { gestor: GestorContagem; maximo: number }) {
  const largura = percentagem(gestor.total, maximo);
  const semGestor = !gestor.chave;
  return (
    <div className="grid grid-cols-[6.5rem_1fr_1.75rem] items-center gap-2.5 px-2 py-[3px]">
      <span
        className={cn(
          'truncate text-[13px] leading-tight',
          semGestor ? 'italic text-muted-foreground' : 'text-foreground'
        )}
        title={gestor.nome}
      >
        {gestor.nome}
      </span>
      {/* O carril fica sempre visível: sem ele, uma barra curta não se
          distingue de uma barra em falta. */}
      <span className="h-[5px] overflow-hidden rounded-full bg-foreground/[0.06]">
        <span
          className={cn(
            'block h-full rounded-full',
            semGestor ? 'bg-muted-foreground/40' : 'bg-primary'
          )}
          style={{ width: `${Math.max(largura, 2)}%` }}
        />
      </span>
      <span className="text-right text-[13px] font-semibold tabular-nums">{gestor.total}</span>
    </div>
  );
}

/** Cabeçalho de painel: uma linha só, rótulo à esquerda e o total à direita. */
function PainelTitulo({ children, total }: { children: React.ReactNode; total: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-2 pb-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{children}</h3>
      <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
    </div>
  );
}

export const MotoristasSemanaCard: React.FC<{ enabled?: boolean }> = ({ enabled = true }) => {
  const navigate = useNavigate();
  const { data, isLoading } = useMotoristasSemana(enabled);

  const semana = data?.semana ?? null;
  const negativos = data?.negativos ?? [];
  const porGestor = data?.porGestor ?? [];
  const comLiquido = data?.totalComLiquido ?? 0;
  const maximoGestor = porGestor[0]?.total ?? 0;
  const fatiaNegativos = percentagem(negativos.length, comLiquido);

  return (
    <Card className={cn('flex flex-col overflow-hidden rounded-xl shadow-none', ALTURA)}>
      <header className="flex items-baseline justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Motoristas</h2>
        {semana && (
          <span className="text-xs text-muted-foreground">
            semana de {formatarIntervaloSemana(semana.inicio, semana.fim)}
          </span>
        )}
      </header>

      {isLoading ? (
        <div className="grid flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          {[0, 1].map((coluna) => (
            <div key={coluna} className="space-y-2">
              <Skeleton className="h-7 w-24" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : !semana ? (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Assim que fechar uma semana com líquidos gravados, ela aparece aqui.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {/* ── Quem fechou a semana negativo ───────────────────────────── */}
          <section className="flex min-h-0 flex-col p-3">
            <div className="flex items-end justify-between gap-2 px-2">
              <div>
                <p className="text-2xl font-semibold leading-none tabular-nums text-destructive">
                  {negativos.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  fecharam negativos, de {comLiquido}
                </p>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{fatiaNegativos}%</span>
            </div>
            <span className="mx-2 mt-2 block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-destructive"
                style={{ width: `${fatiaNegativos}%` }}
              />
            </span>

            {negativos.length === 0 ? (
              <p className="mt-3 px-2 text-sm text-muted-foreground">
                Ninguém fechou a semana negativo.
              </p>
            ) : (
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                {negativos.map((m) => (
                  <NegativoRow
                    key={m.id}
                    motorista={m}
                    onClick={() => navigate(`/motoristas/${m.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Carteira de cada gestor ─────────────────────────────────── */}
          <section className="flex min-h-0 flex-col p-3">
            <PainelTitulo total={data?.totalMotoristas ?? 0}>Por gestor</PainelTitulo>
            {porGestor.length === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">Nenhum motorista activo.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {porGestor.map((g) => (
                  <GestorRow key={g.chave} gestor={g} maximo={maximoGestor} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Card>
  );
};
