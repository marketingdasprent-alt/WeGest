// Cartão "Contas de motoristas" da dashboard Financeiro. Os números são os do
// separador Administrativo › Resumos, pelo mesmo cálculo — este cartão é uma
// janela para lá, não uma segunda contabilidade.
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronRight, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SemanaFechada } from '@/hooks/useUltimaSemanaFechada';
import type { MotoristaResumo } from '@/components/administrativo/contasResumoExports';

interface ContasMotoristasCardProps {
  contas: MotoristaResumo[];
  semanaFechada: SemanaFechada | null;
  /** Quantas linhas mostrar. O cartão não rola — o resto está no rodapé. */
  limite?: number;
  formatarEuro: (valor: number) => string;
}

export function ContasMotoristasCard({
  contas,
  semanaFechada,
  limite = 6,
  formatarEuro,
}: ContasMotoristasCardProps) {
  const navigate = useNavigate();
  const visiveis = contas.slice(0, limite);

  return (
    <Card className="flex flex-col p-4 xl:min-h-0 xl:flex-1">
      <div className="mb-3 flex shrink-0 items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Contas de motoristas
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {semanaFechada
            ? `semana fechada · ${format(semanaFechada.inicio, 'd MMM', { locale: pt })} – ${format(semanaFechada.fim, 'd MMM', { locale: pt })}`
            : 'sem semanas fechadas'}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">
          {semanaFechada ? 'Sem contas nesta semana.' : 'Ainda nao ha nenhuma semana fechada.'}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Motorista</span>
            <span>Líquido</span>
          </div>
          {/* Numa coluna estreita não cabe uma tabela de cinco colunas: o
              líquido fica em destaque à direita e as parcelas passam para a
              linha de baixo, com a etiqueta ao lado do valor. */}
          <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-hidden">
            {/* Cada linha abre a conta do motorista no separador Resumos — o
                mesmo diálogo que se abre clicando-lhe lá. */}
            {visiveis.map((m) => (
              <button
                key={m._uid ?? m.driver_uuid}
                type="button"
                disabled={!m.driver_uuid}
                onClick={() => navigate(`/administrativo?motorista=${m.driver_uuid}`)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60 disabled:pointer-events-none"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{m.driver_name}</div>
                  <div className="text-[11px] tabular-nums text-muted-foreground">
                    {formatarEuro(m.total_faturado)} faturado · {formatarEuro(m.aluguer)} aluguer ·{' '}
                    {formatarEuro(m.combustivel + m.portagens + m.reparacoes)} custos
                  </div>
                </div>
                <span
                  className={
                    m.liquido < 0
                      ? 'shrink-0 text-[15px] font-semibold tabular-nums text-destructive'
                      : 'shrink-0 text-[15px] font-semibold tabular-nums text-success'
                  }
                >
                  {formatarEuro(m.liquido)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/administrativo')}
        className="group mt-3 flex shrink-0 items-center justify-center gap-1.5 border-t border-border/60 pt-3 text-[13px] font-medium text-primary-text transition-colors hover:text-foreground"
      >
        {contas.length > visiveis.length
          ? `Ver as ${contas.length} contas em Administrativo`
          : 'Ver em Administrativo'}
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </Card>
  );
}
