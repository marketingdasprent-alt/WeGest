import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Loader2,
  Search,
  Target,
  User,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AuditEntry, EntidadeAuditavel } from '@/types/audit';

// ── Configuração visual por entidade ─────────────────────────

const ENTITY_ICONS: Record<EntidadeAuditavel, React.FC<React.SVGProps<SVGSVGElement>>> = {
  contrato: FileText,
  reserva: Calendar,
  motorista: User,
  lead: Target,
  calendario: CalendarClock,
};

const ENTITY_LABELS: Record<EntidadeAuditavel, string> = {
  contrato: 'Contrato',
  reserva: 'Reserva',
  motorista: 'Motorista',
  lead: 'Lead',
  calendario: 'Calendário',
};

const PAGE_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Props ────────────────────────────────────────────────────

interface AuditTimelineProps {
  /** Entradas de auditoria já normalizadas (do hook useAuditHistory). */
  entries: AuditEntry[];
  /** Callback quando o filtro textual muda (para sync URL, etc.). */
  onFilterChange?: (filter: string) => void;
  /** Entidade actualmente seleccionada (para ícones e labels). */
  entidade: EntidadeAuditavel;
  /** Estado de loading da query. */
  isLoading?: boolean;
  /** Erro da query, se houver. */
  error?: Error | null;
}

// ── Componente ───────────────────────────────────────────────

/**
 * Timeline cronológica genérica para entradas de auditoria.
 *
 * Renderiza uma lista vertical de eventos com ícones por entidade,
 * busca textual client-side e paginação simples.
 *
 * @example
 * ```tsx
 * <AuditTimeline
 *   entries={data ?? []}
 *   entidade="contrato"
 *   isLoading={isLoading}
 *   error={error}
 * />
 * ```
 */
export const AuditTimeline: React.FC<AuditTimelineProps> = ({
  entries,
  onFilterChange,
  entidade,
  isLoading = false,
  error = null,
}) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // Filtrar entradas por busca textual
  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.acao.toLowerCase().includes(q) ||
        (e.detalhe?.toLowerCase().includes(q) ?? false) ||
        e.tabelaOrigem.toLowerCase().includes(q) ||
        (e.actorId?.toLowerCase().includes(q) ?? false)
    );
  }, [entries, search]);

  // Reset página quando filtro ou entradas mudam
  useEffect(() => {
    setPage(0);
  }, [search, entries]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    onFilterChange?.(value);
  };

  // ── Estado: loading ───────────────────────────────────────
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        role="status"
        aria-label="A carregar auditoria"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Estado: erro ──────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">Erro: {error.message}</p>
      </div>
    );
  }

  // ── Render principal ──────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Busca textual */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Buscar na auditoria..."
          className="pl-9"
          aria-label="Buscar na auditoria"
        />
      </div>

      {/* Estado: vazio */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <History className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {entries.length === 0
              ? 'Sem registos de auditoria.'
              : 'Nenhum resultado para a busca.'}
          </p>
        </div>
      ) : (
        <>
          {/* Timeline */}
          <ol className="relative ml-3 space-y-4 border-l border-border/60">
            {paginated.map((entry) => {
              const Icon = ENTITY_ICONS[entry.entidade] ?? History;
              return (
                <li key={entry.id} className="ml-6">
                  <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 ring-4 ring-background">
                    <Icon className="h-3 w-3 text-primary" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {ENTITY_LABELS[entry.entidade] ?? entry.entidade}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">
                        {entry.acao}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </div>
                    {entry.detalhe && (
                      <p className="text-sm text-muted-foreground">{entry.detalhe}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{entry.tabelaOrigem}</span>
                      {entry.actorId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>por {entry.actorId}</span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} de{' '}
                {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span
                  className={cn('text-xs text-muted-foreground tabular-nums')}
                  aria-current="page"
                >
                  {currentPage + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  aria-label="Página seguinte"
                >
                  Seguinte
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
