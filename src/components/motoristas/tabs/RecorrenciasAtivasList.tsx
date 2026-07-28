import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Repeat, Pause, Play, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { descreverSemanaDoMes } from '@/lib/recorrenciaFinanceira';
import { cn } from '@/lib/utils';
import type { RecorrenciaFinanceira } from './NovoMovimentoFinanceiroOverlay';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export interface RecorrenciasAtivasListProps {
  recorrencias: RecorrenciaFinanceira[];
  onAlterarStatus: (id: string, status: 'ativa' | 'pausada' | 'cancelada') => void;
}

export function RecorrenciasAtivasList({
  recorrencias,
  onAlterarStatus,
}: RecorrenciasAtivasListProps) {
  const ativasOuPausadas = recorrencias.filter(
    (r) => r.status === 'ativa' || r.status === 'pausada'
  );
  if (ativasOuPausadas.length === 0) return null;

  return (
    <SectionCard
      icon={<Repeat className="h-4 w-4" />}
      title="Recorrências Ativas"
      headerClassName="bg-purple-50 dark:bg-purple-950/30"
    >
      <div className="space-y-2">
        {ativasOuPausadas.map((rec) => (
          <div
            key={rec.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3',
              rec.status === 'pausada' && 'opacity-60 bg-muted/30'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{rec.descricao}</p>
                <Badge variant={rec.tipo === 'credito' ? 'default' : 'secondary'}>
                  {rec.tipo === 'credito' ? 'Crédito' : 'Débito'}
                </Badge>
                <Badge variant="outline">
                  {rec.frequencia === 'semanal' ? 'Semanal' : 'Mensal'}
                </Badge>
                {rec.status === 'pausada' && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    Pausada
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatCurrency(Number(rec.valor))} ·{' '}
                {rec.frequencia === 'mensal'
                  ? descreverSemanaDoMes(parseISO(rec.semana_ancora))
                  : `desde ${format(parseISO(rec.semana_ancora), 'dd/MM/yyyy', { locale: pt })}`}
                {rec.data_fim
                  ? ` · até ${format(parseISO(rec.data_fim), 'dd/MM/yyyy', { locale: pt })}`
                  : rec.max_ocorrencias
                    ? ` · ${rec.ocorrencias_geradas}/${rec.max_ocorrencias} ocorrências`
                    : ' · sem data de fim'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {rec.status === 'ativa' ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Pausar"
                  onClick={() => onAlterarStatus(rec.id, 'pausada')}
                  className="text-amber-600 hover:text-amber-700"
                >
                  <Pause className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Retomar"
                  onClick={() => onAlterarStatus(rec.id, 'ativa')}
                  className="text-green-600 hover:text-green-700"
                >
                  <Play className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                title="Cancelar recorrência"
                onClick={() => onAlterarStatus(rec.id, 'cancelada')}
                className="text-destructive hover:text-destructive"
              >
                <Ban className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
