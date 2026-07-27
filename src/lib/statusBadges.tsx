import { Badge } from '@/components/ui/badge';

// ── CONTRATOS ────────────────────────────────────────────────────
export type ContratoStatus = 'ativo' | 'substituido' | 'cancelado' | 'encerrado' | 'expirado';

interface ContratoStatusBadgeProps {
  status: string | null | undefined;
}

export function ContratoStatusBadge({ status }: ContratoStatusBadgeProps) {
  switch (status) {
    case 'ativo':
      return <Badge variant="default">Ativo</Badge>;
    case 'substituido':
      return <Badge variant="secondary">Substituído</Badge>;
    case 'cancelado':
      return <Badge variant="destructive">Cancelado</Badge>;
    case 'encerrado':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Encerrado
        </Badge>
      );
    case 'expirado':
      return <Badge variant="secondary">Expirado</Badge>;
    default:
      return <Badge variant="outline">{status || '-'}</Badge>;
  }
}

// ── RECIBOS ──────────────────────────────────────────────────────
export type ReciboStatus = 'submetido' | 'validado' | 'rejeitado';

interface ReciboStatusBadgeProps {
  status: string | null | undefined;
}

export function ReciboStatusBadge({ status }: ReciboStatusBadgeProps) {
  switch (status) {
    case 'validado':
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Validado</Badge>;
    case 'rejeitado':
      return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Rejeitado</Badge>;
    case 'submetido':
      return (
        <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>
      );
    default:
      return <Badge variant="outline">{status || '-'}</Badge>;
  }
}

// ── MOVIMENTOS FINANCEIROS ───────────────────────────────────────
export type MovimentoStatus = 'pago' | 'pendente' | 'cancelado';

interface MovimentoStatusBadgeProps {
  status: string | null | undefined;
}

export function MovimentoStatusBadge({ status }: MovimentoStatusBadgeProps) {
  switch (status) {
    case 'pago':
      return (
        <Badge variant="default" className="bg-green-600">
          Pago
        </Badge>
      );
    case 'pendente':
      return <Badge variant="secondary">Pendente</Badge>;
    case 'cancelado':
      return <Badge variant="destructive">Cancelado</Badge>;
    default:
      return <Badge variant="outline">{status || '-'}</Badge>;
  }
}

// ── BOLT SYNC ────────────────────────────────────────────────────
export type BoltSyncStatus = 'success' | 'error' | 'partial';

interface BoltSyncStatusBadgeProps {
  status: string | null | undefined;
}

export function BoltSyncStatusBadge({ status }: BoltSyncStatusBadgeProps) {
  switch (status) {
    case 'success':
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Sucesso</Badge>;
    case 'error':
      return <Badge variant="destructive">Erro</Badge>;
    case 'partial':
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Parcial</Badge>
      );
    default:
      return <Badge variant="secondary">{status || '-'}</Badge>;
  }
}

// ── MOTORISTA (status_ativo) ─────────────────────────────────────
interface MotoristaStatusBadgeProps {
  statusAtivo: boolean | null | undefined;
  className?: string;
}

export function MotoristaStatusBadge({ statusAtivo, className }: MotoristaStatusBadgeProps) {
  return (
    <Badge variant={statusAtivo ? 'default' : 'secondary'} className={className}>
      {statusAtivo ? 'Ativo' : 'Inativo'}
    </Badge>
  );
}
