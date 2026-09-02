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
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import {
  useDividasMotorista,
  useAtualizarEstadoDivida,
  type Divida,
} from '@/hooks/useDividasMotorista';
import { useCanEditFinanceiro } from '@/hooks/useCanEditFinanceiro';

const ESTADO_LABEL: Record<Divida['estado'], string> = {
  por_cobrar: 'Por cobrar',
  paga: 'Paga',
  cancelada: 'Cancelada',
};

const ESTADO_CLASS: Record<Divida['estado'], string> = {
  por_cobrar: 'bg-red-500/10 text-red-600 border-red-200',
  paga: 'bg-green-500/10 text-green-600 border-green-200',
  cancelada: 'bg-muted text-muted-foreground border-transparent',
};

export function DividasTab() {
  const [pesquisa, setPesquisa] = useState('');
  const [estado, setEstado] = useState<string>('por_cobrar');
  const { canEdit } = useCanEditFinanceiro();
  const { data: dividas, isLoading } = useDividasMotorista({
    pesquisa: pesquisa || undefined,
    estado: estado === 'todas' ? undefined : estado,
  });
  const { mutate: atualizarEstado, isPending } = useAtualizarEstadoDivida();

  const totalPorCobrar = (dividas ?? [])
    .filter((d) => d.estado === 'por_cobrar')
    .reduce((soma, d) => soma + d.valor_total, 0);

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
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="por_cobrar">Por cobrar</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : !dividas || dividas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma dívida encontrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Valor do período</TableHead>
                <TableHead className="text-right">Danos</TableHead>
                <TableHead className="text-right">Caução</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                {canEdit && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dividas.map((d) => (
                <TableRow key={d.id}>
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
                      d.valor_total > 0 ? 'text-red-600' : d.valor_total < 0 ? 'text-green-600' : ''
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
                      {d.estado === 'por_cobrar' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => atualizarEstado({ id: d.id, estado: 'paga' })}
                          >
                            Marcar paga
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => atualizarEstado({ id: d.id, estado: 'cancelada' })}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
