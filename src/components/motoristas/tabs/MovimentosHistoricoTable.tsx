import { useState } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  RefreshCw,
  ListOrdered,
  HandCoins,
  FileText,
  Check,
  X,
  Pencil,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, type SortDirection } from '@/components/ui/sortable-table-head';
import { SectionCard } from '@/components/ui/section-card';
import { cn } from '@/lib/utils';
import {
  CATEGORIAS,
  isMovimentoDaFaturacao,
  type MovimentoFinanceiro,
} from './NovoMovimentoFinanceiroOverlay';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function isReparacaoAguardaAcordo(m: MovimentoFinanceiro) {
  return (
    m.categoria === 'reparacao' &&
    m.status === 'pendente' &&
    !m.descricao.startsWith('Acordo de pagamento')
  );
}

export interface MovimentosHistoricoTableProps {
  movimentos: MovimentoFinanceiro[];
  movimentoFaturaMap: Map<string, string>;
  canEdit: boolean;
  sortField: string;
  sortDir: SortDirection;
  onSort: (field: string) => void;
  onRefresh: () => void;
  onNovoMovimento: () => void;
  onAbrirAcordo: (movimento: MovimentoFinanceiro) => void;
  onAbrirEditar: (movimento: MovimentoFinanceiro) => void;
  onMarcarPago: (id: string) => void;
  onCancelar: (id: string) => void;
}

export function MovimentosHistoricoTable({
  movimentos,
  movimentoFaturaMap,
  canEdit,
  sortField,
  sortDir,
  onSort,
  onRefresh,
  onNovoMovimento,
  onAbrirAcordo,
  onAbrirEditar,
  onMarcarPago,
  onCancelar,
}: MovimentosHistoricoTableProps) {
  // Movimentos futuros (parcelamentos de acordo, sobretudo) escondem-se por
  // omissão: um acordo de dezenas de semanas põe o crédito ou débito mais
  // recente lá para trás na ordenação por data, invisível sem scroll.
  const [mostrarFuturos, setMostrarFuturos] = useState(false);
  const hojeStr = format(new Date(), 'yyyy-MM-dd');
  const futuros = movimentos.filter((m) => m.data_movimento > hojeStr);
  const movimentosVisiveis = mostrarFuturos
    ? movimentos
    : movimentos.filter((m) => m.data_movimento <= hojeStr);

  return (
    <SectionCard
      icon={<ListOrdered className="h-4 w-4" />}
      title="Histórico de Movimentos"
      headerClassName="bg-blue-50 dark:bg-blue-950/30"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Histórico de movimentos financeiros do motorista.
        </p>
        <div className="flex gap-2">
          {futuros.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setMostrarFuturos((v) => !v)}>
              {mostrarFuturos ? (
                <EyeOff className="h-4 w-4 mr-2" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              {mostrarFuturos
                ? 'Ocultar futuros'
                : `Mostrar ${futuros.length} futuro${futuros.length > 1 ? 's' : ''}`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button size="sm" onClick={onNovoMovimento}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Movimento
          </Button>
          {/* "Adicionar à dívida" saiu daqui: a dívida deixou de ser criada à
              mão. É o saldo pendente do motorista, e aparece sozinha na aba
              Dívidas assim que fica negativo. */}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              field="data_movimento"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Data
            </SortableTableHead>
            <SortableTableHead
              field="descricao"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Descrição
            </SortableTableHead>
            <SortableTableHead
              field="categoria"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Categoria
            </SortableTableHead>
            <SortableTableHead field="tipo" sortField={sortField} sortDir={sortDir} onSort={onSort}>
              Tipo
            </SortableTableHead>
            <SortableTableHead
              field="valor"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
              align="right"
            >
              Valor
            </SortableTableHead>
            <SortableTableHead
              field="status"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Estado
            </SortableTableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movimentosVisiveis.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                {movimentos.length === 0
                  ? 'Nenhum movimento financeiro registado.'
                  : 'Sem movimentos até hoje — todos os registados são futuros.'}
              </TableCell>
            </TableRow>
          ) : (
            movimentosVisiveis.map((movimento) => (
              <TableRow
                key={movimento.id}
                className={cn(
                  movimento.status === 'cancelado' && 'opacity-50',
                  isReparacaoAguardaAcordo(movimento) && 'bg-amber-50/50 dark:bg-amber-950/10'
                )}
              >
                <TableCell>{format(new Date(movimento.data_movimento), 'dd/MM/yyyy')}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{movimento.descricao}</p>
                    {movimento.referencia && (
                      <p className="text-xs text-muted-foreground">
                        Ref:{' '}
                        {movimento.referencia.includes(' | http')
                          ? movimento.referencia.split(' | ')[0]
                          : movimento.referencia}
                      </p>
                    )}
                    {movimentoFaturaMap.get(movimento.id) && (
                      <a
                        href={movimentoFaturaMap.get(movimento.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                      >
                        <FileText className="h-3 w-3" />
                        Ver fatura
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {movimento.categoria
                    ? CATEGORIAS.find((c) => c.value === movimento.categoria)?.label ||
                      movimento.categoria
                    : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={movimento.tipo === 'credito' ? 'default' : 'secondary'}>
                    {movimento.tipo === 'credito' ? 'Crédito' : 'Débito'}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    movimento.tipo === 'credito' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {movimento.tipo === 'credito' ? '+' : '-'}
                  {formatCurrency(Number(movimento.valor))}
                </TableCell>
                <TableCell>
                  {isReparacaoAguardaAcordo(movimento) ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500 text-amber-600 whitespace-nowrap"
                    >
                      Aguarda Acordo
                    </Badge>
                  ) : (
                    <Badge
                      variant={
                        movimento.status === 'pago'
                          ? 'default'
                          : movimento.status === 'cancelado'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {movimento.status === 'pago'
                        ? 'Pago'
                        : movimento.status === 'cancelado'
                          ? 'Cancelado'
                          : 'Pendente'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* Movimento gerido pela faturação → sem ações nenhumas.
                        Paga-se/altera-se no contrato, nunca aqui (senão o
                        saldo do motorista e a fatura divergiam em silêncio). */}
                    {isMovimentoDaFaturacao(movimento) ? (
                      <span
                        className="text-xs text-muted-foreground whitespace-nowrap"
                        title="Movimento gerido pela faturação — para pagar ou alterar, vá ao contrato/fatura de origem."
                      >
                        Gerido na fatura
                      </span>
                    ) : /* Reparação pendente (sem acordo definido) → apenas "Definir Acordo" */
                    isReparacaoAguardaAcordo(movimento) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-500 text-amber-700 hover:bg-amber-50 hover:text-amber-700 whitespace-nowrap"
                        onClick={() => onAbrirAcordo(movimento)}
                      >
                        <HandCoins className="h-4 w-4 mr-1" />
                        Definir Acordo
                      </Button>
                    ) : movimento.status === 'pendente' && canEdit ? (
                      /* Outros pendentes → ✓ / ✗ (só quem pode editar) */
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onMarcarPago(movimento.id)}
                          title="Marcar como pago"
                          className="text-green-600 hover:text-green-700"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onCancelar(movimento.id)}
                          title="Cancelar"
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                    {/* Botão editar — só admin/Supervisor Gestor TVDE, e nunca
                        em movimentos geridos pela faturação (ver acima). */}
                    {canEdit && !isMovimentoDaFaturacao(movimento) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onAbrirEditar(movimento)}
                        title="Editar movimento"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
