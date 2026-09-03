import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SectionCard } from '@/components/ui/section-card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import {
  useDividasMotorista,
  useMarcarDividaPaga,
  useMarcarDividaNaoPaga,
  type Divida,
  type EstadoDivida,
} from '@/hooks/useDividasMotorista';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

const ESTADO_LABEL: Record<EstadoDivida, string> = {
  por_cobrar: 'Por cobrar',
  paga: 'Paga',
};

const ESTADO_CLASS: Record<EstadoDivida, string> = {
  por_cobrar: 'bg-red-500/10 text-red-600 border-red-200',
  paga: 'bg-green-500/10 text-green-600 border-green-200',
};

export function DividasTab() {
  const [pesquisa, setPesquisa] = useState('');
  // "Todas" por omissão de propósito: marcar uma dívida como paga move-a de
  // lista, e com o filtro em "Por cobrar" a linha sumia à frente de quem
  // acabara de clicar — parecia apagada.
  const [estado, setEstado] = useState<'por_cobrar' | 'paga' | 'todas'>('todas');
  // Mesmo recurso que já gere a sidebar/rota/RLS desta funcionalidade
  // (financeiro_recibos) — antes gate admin-only, agora alinhado.
  const { hasAccessToResource } = usePermissions();
  const canEdit = hasAccessToResource(RECURSOS.FINANCEIRO_RECIBOS);
  const {
    data: dividas,
    isLoading,
    isError,
  } = useDividasMotorista({ pesquisa: pesquisa || undefined, estado });
  const { mutate: marcarPaga, isPending: aPagar } = useMarcarDividaPaga();
  const { mutate: marcarNaoPaga, isPending: aReabrir } = useMarcarDividaNaoPaga();
  const ocupado = aPagar || aReabrir;

  const totalPorCobrar = (dividas ?? [])
    .filter((d) => d.estado === 'por_cobrar')
    .reduce((soma, d) => soma + d.valor_total, 0);

  // Marcar paga muda o estado de todos os movimentos por liquidar do
  // motorista de uma vez — um clique enganado já liquidou 55 movimentos de
  // uma pessoa. Pede confirmação; reabrir não pede, porque devolve tudo.
  const [aConfirmar, setAConfirmar] = useState<Divida | null>(null);

  const alternarEstado = (d: Divida) => {
    if (d.estado === 'por_cobrar') setAConfirmar(d);
    else marcarNaoPaga(d.id);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Total por cobrar (dívidas visíveis)</p>
        <p
          data-testid="dividas-total-por-cobrar"
          className={cn(
            'text-2xl font-bold',
            totalPorCobrar > 0 ? 'text-red-600' : 'text-green-600'
          )}
        >
          {formatCurrency(totalPorCobrar)}
        </p>
      </div>

      <SectionCard
        icon={<HandCoins className="h-4 w-4" />}
        title="Dívidas"
        action={
          <div className="flex gap-2">
            <Input
              placeholder="Pesquisar motorista..."
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              className="h-8 w-48"
            />
            <Select
              value={estado}
              onValueChange={(v) => setEstado(v as 'por_cobrar' | 'paga' | 'todas')}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="por_cobrar">Por cobrar</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar as dívidas.</p>
        ) : !dividas || dividas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma dívida encontrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Danos</TableHead>
                <TableHead className="text-right">Caução</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                {canEdit && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dividas.map((d) => (
                <TableRow key={`${d.estado}-${d.id}`}>
                  <TableCell>{d.motorista_nome}</TableCell>
                  <TableCell>
                    {formatDate(d.periodo_inicio)} – {formatDate(d.periodo_fim)}
                  </TableCell>
                  <TableCell className={cn('text-right', d.valor_periodo < 0 && 'text-red-600')}>
                    {formatCurrency(d.valor_periodo)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(d.valor_danos)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(d.valor_caucao)}</TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-bold',
                      d.estado === 'por_cobrar' ? 'text-red-600' : 'text-muted-foreground'
                    )}
                  >
                    {formatCurrency(d.valor_total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ESTADO_CLASS[d.estado]}>
                      {ESTADO_LABEL[d.estado]}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      {/* Um só botão, que alterna. Marcar paga liquida os
                          movimentos do motorista; marcar não paga devolve a
                          pendente exactamente os que aquela dívida levou. */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() => alternarEstado(d)}
                      >
                        {d.estado === 'por_cobrar' ? 'Marcar paga' : 'Marcar não paga'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <AlertDialog open={!!aConfirmar} onOpenChange={(v) => !v && setAConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar a dívida como paga?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os movimentos por liquidar de <strong>{aConfirmar?.motorista_nome}</strong>{' '}
              passam a pago no perfil financeiro dele, e o saldo vai a zero — são{' '}
              <strong>{formatCurrency(aConfirmar?.valor_total ?? 0)}</strong>. A linha fica aqui,
              como paga, e podes desfazer a qualquer momento em "Marcar não paga".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aConfirmar) marcarPaga(aConfirmar.motorista_id);
                setAConfirmar(null);
              }}
            >
              Marcar paga
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
