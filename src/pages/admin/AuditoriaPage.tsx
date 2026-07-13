import { useState } from 'react';
import { History, Search } from 'lucide-react';
import { useAuditHistory } from '@/hooks/useAuditHistory';
import { AuditTimeline } from '@/components/ui/audit-timeline';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EntidadeAuditavel } from '@/types/audit';

// ── Configuração ─────────────────────────────────────────────

const ENTITY_OPTIONS: { value: EntidadeAuditavel; label: string }[] = [
  { value: 'contrato', label: 'Contrato' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'motorista', label: 'Motorista' },
  { value: 'lead', label: 'Lead' },
  { value: 'calendario', label: 'Calendário' },
];

/**
 * Entidades sem tabelas de histórico dedicada (cf. useAuditHistory).
 * O hook retorna `undefined` para estas entidades — mostramos aviso.
 */
const ENTITIES_WITHOUT_HISTORY: ReadonlySet<EntidadeAuditavel> = new Set(['reserva', 'motorista']);

// ── Página ────────────────────────────────────────────────────

/**
 * Página de auditoria — permite a admins e Supervisores Gestor TVDE
 * consultar o histórico de alterações de uma entidade específica.
 *
 * O utilizador selecciona o tipo de entidade, introduz o ID do registo
 * e a timeline mostra todas as entradas de auditoria normalizadas.
 */
export default function AuditoriaPage() {
  const [entidade, setEntidade] = useState<EntidadeAuditavel>('contrato');
  const [entityId, setEntityId] = useState('');
  const [submittedId, setSubmittedId] = useState('');

  const { data, isLoading, error } = useAuditHistory({
    entidade,
    id: submittedId,
  });

  const hasNoHistory = ENTITIES_WITHOUT_HISTORY.has(entidade);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = entityId.trim();
    if (trimmed) {
      setSubmittedId(trimmed);
    }
  };

  return (
    <div className="space-y-6">
      <StickyPageHeader
        title="Auditoria"
        description="Histórico de alterações por entidade"
        icon={History}
      />

      {/* Formulário de filtro */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={entidade}
          onValueChange={(v) => {
            setEntidade(v as EntidadeAuditavel);
            setSubmittedId('');
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Entidade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="ID do registo (UUID)"
          className="flex-1"
          aria-label="ID do registo"
        />

        <Button type="submit" disabled={!entityId.trim() || hasNoHistory}>
          <Search className="mr-2 h-4 w-4" />
          Auditar
        </Button>
      </form>

      {/* Aviso para entidades sem histórico */}
      {hasNoHistory && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Esta entidade não tem tabelas de histórico dedicadas. A auditoria não está disponível
            para {entidade === 'reserva' ? 'reservas' : 'motoristas'}.
          </p>
        </div>
      )}

      {/* Timeline */}
      {!hasNoHistory && submittedId && (
        <AuditTimeline
          entries={data ?? []}
          onFilterChange={() => {}}
          entidade={entidade}
          isLoading={isLoading}
          error={error instanceof Error ? error : null}
        />
      )}

      {/* Estado inicial — antes de submeter */}
      {!hasNoHistory && !submittedId && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <History className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Seleccione uma entidade e introduza o ID do registo para ver o histórico de auditoria.
          </p>
        </div>
      )}
    </div>
  );
}
