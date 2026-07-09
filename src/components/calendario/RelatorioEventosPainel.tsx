import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { formatMatricula } from './EventoCard';
import { cn } from '@/lib/utils';
import type { CalendarioEvento } from '@/pages/Calendario';
import { TIPOS_CONFIG } from './relatorioDialog.constants';

function EventoCard({ ev }: { ev: CalendarioEvento }) {
  const tipoConfig = TIPOS_CONFIG.find((t) => t.value === ev.tipo);
  const titulo =
    ev.tipo === 'lista_espera' || ev.tipo === 'slot'
      ? ev.titulo
      : ev.tipo === 'troca'
        ? `${formatMatricula(ev.titulo)}${ev.matricula_devolver ? ` ↔ ${formatMatricula(ev.matricula_devolver)}` : ''}`
        : formatMatricula(ev.titulo);
  return (
    <div
      className={cn(
        'border border-l-4 rounded-lg p-3 text-sm space-y-1 bg-card',
        ev.tipo === 'entrega' && 'border-l-green-500',
        ev.tipo === 'recolha' && 'border-l-blue-500',
        ev.tipo === 'devolucao' && 'border-l-orange-500',
        ev.tipo === 'troca' && 'border-l-purple-500',
        ev.tipo === 'upgrade' && 'border-l-yellow-500',
        ev.tipo === 'lista_espera' && 'border-l-pink-500',
        ev.tipo === 'slot' && 'border-l-amber-500'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate">
          {titulo}
          {ev.cidade && ` — ${ev.cidade.toUpperCase()}`}
        </span>
        {tipoConfig && (
          <span
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0',
              tipoConfig.color
            )}
          >
            {tipoConfig.label}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        <span>
          {format(new Date(ev.data_inicio), ev.dia_todo ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm', {
            locale: pt,
          })}
        </span>
        {ev.profiles?.nome && <span>Por: {ev.profiles.nome}</span>}
        {ev.descricao && <span className="w-full italic">Obs: {ev.descricao}</span>}
      </div>
    </div>
  );
}

interface MatrizGestorTipoRow {
  id: string;
  nome: string;
  total: number;
  porTipo: Record<string, number>;
}

interface RelatorioEventosPainelProps {
  podeVerGestores: boolean;
  isLoading: boolean;
  eventosFiltrados: CalendarioEvento[];
  tiposPresentes: typeof TIPOS_CONFIG;
  matrizGestorTipo: MatrizGestorTipoRow[];
  eventosNormais: CalendarioEvento[];
  eventosSlot: CalendarioEvento[];
}

export function RelatorioEventosPainel({
  podeVerGestores,
  isLoading,
  eventosFiltrados,
  tiposPresentes,
  matrizGestorTipo,
  eventosNormais,
  eventosSlot,
}: RelatorioEventosPainelProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Matriz Gestor × Tipo (quantas entregas/devoluções/... por gestor) */}
        {podeVerGestores && !isLoading && eventosFiltrados.length > 0 && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/40">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Por Gestor &times; Tipo
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-1.5 text-left font-medium">Gestor</th>
                    {tiposPresentes.map((t) => (
                      <th
                        key={t.value}
                        className="px-2 py-1.5 text-center font-medium whitespace-nowrap"
                      >
                        {t.label}
                      </th>
                    ))}
                    <th className="px-3 py-1.5 text-center font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matrizGestorTipo.map((g, i) => (
                    <tr
                      key={g.id}
                      className={cn('border-b last:border-0', i % 2 === 1 && 'bg-muted/20')}
                    >
                      <td className="px-3 py-1.5 font-medium truncate max-w-[180px]">{g.nome}</td>
                      {tiposPresentes.map((t) => (
                        <td key={t.value} className="px-2 py-1.5 text-center tabular-nums">
                          {g.porTipo[t.value] > 0 ? (
                            g.porTipo[t.value]
                          ) : (
                            <span className="text-muted-foreground/30">·</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-center font-bold tabular-nums">{g.total}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-3 py-1.5">Total</td>
                    {tiposPresentes.map((t) => (
                      <td key={t.value} className="px-2 py-1.5 text-center tabular-nums">
                        {eventosFiltrados.filter((e) => e.tipo === t.value).length}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-center tabular-nums">
                      {eventosFiltrados.length}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : eventosFiltrados.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-16">
            Nenhum evento no período selecionado.
          </p>
        ) : (
          <>
            {/* ── Eventos normais ── */}
            {eventosNormais.length > 0 && (
              <>
                {eventosSlot.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 pb-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Eventos
                    </span>
                    <span className="text-xs text-muted-foreground">({eventosNormais.length})</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {eventosNormais.map((ev) => (
                  <EventoCard key={ev.id} ev={ev} />
                ))}
              </>
            )}

            {/* ── Slots (secção separada) ── */}
            {eventosSlot.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2 pb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Slots
                  </span>
                  <span className="text-xs text-muted-foreground">({eventosSlot.length})</span>
                  <div className="flex-1 h-px bg-amber-500/30" />
                </div>
                {eventosSlot.map((ev) => (
                  <EventoCard key={ev.id} ev={ev} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
