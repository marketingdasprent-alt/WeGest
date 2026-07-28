import { format } from 'date-fns';
import { Plus, RefreshCw, ListOrdered, HandCoins, FileText, Check, X, Pencil } from 'lucide-react';
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
import { CATEGORIAS, type MovimentoFinanceiro } from './NovoMovimentoFinanceiroOverlay';

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

/**
 * Débito de cessão de dívida lançado por `acordo_criar` (migração
 * 20260724100001_acordos_saldo_e_criar.sql) quando o responsável de um acordo
 * de pagamento é um motorista: `categoria: 'outro'`, `descricao` a começar por
 * "Dívida assumida (cedida por ". Verificado contra o INSERT real, não
 * assumido — sem coluna dedicada, é o par categoria+prefixo da descrição que
 * identifica isto de forma fiável (a categoria 'outro' sozinha é ambígua,
 * usada para vários lançamentos manuais).
 *
 * NOTA: hoje esta função nunca deteta nada em produção — `acordo_criar`
 * recusa sempre um responsável motorista (TVDE fatura-se fora do WeGest), por
 * isso este ramo do backend está morto. Mantido aqui por coerência com esse
 * código e por defensividade caso a regra alguma vez mude.
 */
function isCessaoAssumida(m: MovimentoFinanceiro): boolean {
  return m.categoria === 'outro' && m.descricao.startsWith('Dívida assumida (cedida por');
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
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button size="sm" onClick={onNovoMovimento}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Movimento
          </Button>
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
          {movimentos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                Nenhum movimento financeiro registado.
              </TableCell>
            </TableRow>
          ) : (
            movimentos.map((movimento) => (
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
                  {isCessaoAssumida(movimento) ? (
                    <Badge
                      variant="outline"
                      className="border-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    >
                      Cessão
                    </Badge>
                  ) : movimento.categoria ? (
                    CATEGORIAS.find((c) => c.value === movimento.categoria)?.label ||
                    movimento.categoria
                  ) : (
                    '-'
                  )}
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
                    {/* Reparação pendente (sem acordo definido) → apenas "Definir Acordo" */}
                    {isReparacaoAguardaAcordo(movimento) ? (
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
                    {/* Botão editar — só visível para admin/Supervisor Gestor TVDE */}
                    {canEdit && (
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
