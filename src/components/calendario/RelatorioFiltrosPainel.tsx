import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { CalendarioEvento } from '@/pages/Calendario';
import { TIPOS_CONFIG, TIPO_COLORS_PDF } from './relatorioDialog.constants';

interface TotalPorTipoEntry {
  value: string;
  label: string;
  count: number;
}

interface TotalPorGestorEntry {
  id: string;
  nome: string;
  count: number;
}

interface RelatorioFiltrosPainelProps {
  modoData: 'evento' | 'criacao';
  onModoDataChange: (v: 'evento' | 'criacao') => void;
  dataInicio: string;
  onDataInicioChange: (v: string) => void;
  dataFim: string;
  onDataFimChange: (v: string) => void;
  tipoFiltro: string | null;
  onTipoFiltroChange: (v: string | null) => void;
  eventos: CalendarioEvento[];
  podeVerGestores: boolean;
  totalPorGestor: TotalPorGestorEntry[];
  gestorFiltro: string | null;
  onGestorFiltroChange: (v: string | null) => void;
  totalPorTipo: TotalPorTipoEntry[];
  maxTipoCount: number;
  GESTOR_PALETTE: string[];
  maxGestorCount: number;
  eventosFiltrados: CalendarioEvento[];
}

export function RelatorioFiltrosPainel({
  modoData,
  onModoDataChange,
  dataInicio,
  onDataInicioChange,
  dataFim,
  onDataFimChange,
  tipoFiltro,
  onTipoFiltroChange,
  eventos,
  podeVerGestores,
  totalPorGestor,
  gestorFiltro,
  onGestorFiltroChange,
  totalPorTipo,
  maxTipoCount,
  GESTOR_PALETTE,
  maxGestorCount,
  eventosFiltrados,
}: RelatorioFiltrosPainelProps) {
  return (
    <div className="w-72 shrink-0 border-r bg-muted/20 flex flex-col overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Modo de data */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Filtrar por
          </Label>
          <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
            <button
              type="button"
              onClick={() => onModoDataChange('evento')}
              className={cn(
                'flex-1 px-2 py-1.5 transition-colors',
                modoData === 'evento'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted'
              )}
            >
              Data do Evento
            </button>
            <button
              type="button"
              onClick={() => onModoDataChange('criacao')}
              className={cn(
                'flex-1 px-2 py-1.5 transition-colors border-l border-border',
                modoData === 'criacao'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted'
              )}
            >
              Data de Registo
            </button>
          </div>
          {modoData === 'criacao' && (
            <p className="text-[10px] text-muted-foreground leading-tight">
              Mostra eventos registados neste período, independentemente da data de entrega.
            </p>
          )}
        </div>

        {/* Datas */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Período
          </Label>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="relatorio-inicio" className="text-xs">
                De
              </Label>
              <input
                id="relatorio-inicio"
                type="date"
                value={dataInicio}
                onChange={(e) => onDataInicioChange(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="relatorio-fim" className="text-xs">
                Até
              </Label>
              <input
                id="relatorio-fim"
                type="date"
                value={dataFim}
                onChange={(e) => onDataFimChange(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Filtros tipo */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Tipo de Evento
          </Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onTipoFiltroChange(null)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all',
                tipoFiltro === null
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
              )}
            >
              Todos ({eventos.length})
            </button>
            {TIPOS_CONFIG.map((t) => {
              const count = eventos.filter((ev) => ev.tipo === t.value).length;
              if (count === 0) return null;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onTipoFiltroChange(t.value)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all',
                    tipoFiltro === t.value
                      ? t.colorActive
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {t.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtros gestor */}
        {podeVerGestores && totalPorGestor.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Gestor
            </Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onGestorFiltroChange(null)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all',
                  gestorFiltro === null
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                )}
              >
                Todos ({eventos.length})
              </button>
              {totalPorGestor.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onGestorFiltroChange(g.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all truncate max-w-[150px]',
                    gestorFiltro === g.id
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                  )}
                  title={g.nome}
                >
                  {g.nome} ({g.count})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gráfico por tipo */}
        {totalPorTipo.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Por Tipo
            </Label>
            <div className="space-y-2">
              {totalPorTipo.map((t) => (
                <div key={t.value} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{t.label}</span>
                    <span className="font-bold text-foreground">{t.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(t.count / maxTipoCount) * 100}%`,
                        backgroundColor: `rgb(${TIPO_COLORS_PDF[t.value]?.join(',') || '120,120,120'})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gráfico por gestor */}
        {podeVerGestores && totalPorGestor.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Por Gestor
            </Label>
            <div className="space-y-2">
              {totalPorGestor.map((g, i) => (
                <div key={g.id} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium text-foreground truncate">{g.nome}</span>
                    <span className="font-bold text-foreground shrink-0">{g.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        GESTOR_PALETTE[i % GESTOR_PALETTE.length]
                      )}
                      style={{ width: `${(g.count / maxGestorCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Total */}
        {eventosFiltrados.length > 0 && (
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-primary">{eventosFiltrados.length}</p>
            <p className="text-xs text-muted-foreground">evento(s) no período</p>
          </div>
        )}
      </div>
    </div>
  );
}
