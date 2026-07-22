import { FileText, Loader2, RefreshCw } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useEventosPendentesRenting } from '@/hooks/useEventosPendentesRenting';
import { estadoRenovacaoContrato } from '@/lib/renovacaoContrato';
import type { ContratoRenting } from '@/types/contratoRenting';
import { EstadoOperacionalBadge } from './EstadoOperacionalBadge';
import { EstadoFinanceiroBadge } from './EstadoFinanceiroBadge';
import { formatCurrency, formatDateTime, getContratoTotal } from './contratosUtils';

export type SortColumn =
  | 'codigo'
  | 'matricula'
  | 'grupo'
  | 'data_inicio'
  | 'data_fim'
  | 'cliente_nome'
  | 'condutor_nome'
  | 'estado_operacional'
  | 'estado_financeiro'
  | 'total_final';

export type SortDir = 'asc' | 'desc';

interface ContratosTabelaProps {
  contratos: ContratoRenting[];
  isLoading: boolean;
  totalSemFiltros: number;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
  onRowClick: (c: ContratoRenting) => void;
  getClienteNome: (id: string | null | undefined) => string;
  getEstacaoNome: (id: string | null | undefined) => string;
  getCondutorNome: (contratoId: string) => string;
}

export const ContratosTabela: React.FC<ContratosTabelaProps> = ({
  contratos,
  isLoading,
  totalSemFiltros,
  sortColumn,
  sortDir,
  onSort,
  onRowClick,
  getClienteNome,
  getEstacaoNome,
  getCondutorNome,
}) => {
  const handleSort = (f: string) => onSort(f as SortColumn);

  // Contratos com recolha agendada mas ainda não confirmada — mostra-se um
  // indicador extra no badge de estado (ver EstadoOperacionalBadge).
  // ignorarFuturos: só conta como pendente quando a data já chegou — senão
  // todo o contrato em curso com data_fim no futuro mostrava "Recolha
  // agendada" desde o dia 1, semanas/meses antes de ser preciso.
  const { data: recolhasPendentes = [] } = useEventosPendentesRenting({
    tipo: 'recolha',
    ignorarFuturos: true,
  });
  const idsComRecolhaPendente = new Set(recolhasPendentes.map((e) => e.origem_id));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <SortableTableHead
              field="codigo"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Código
            </SortableTableHead>
            <SortableTableHead
              field="matricula"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Matrícula
            </SortableTableHead>
            <SortableTableHead
              field="grupo"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Grupo
            </SortableTableHead>
            <TableHead className="h-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Estação Entrega
            </TableHead>
            <SortableTableHead
              field="data_inicio"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Data Início
            </SortableTableHead>
            <SortableTableHead
              field="data_fim"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Data Fim
            </SortableTableHead>
            <SortableTableHead
              field="cliente_nome"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Cliente
            </SortableTableHead>
            <SortableTableHead
              field="condutor_nome"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Condutor/Motorista
            </SortableTableHead>
            <SortableTableHead
              field="estado_operacional"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Estado
            </SortableTableHead>
            <SortableTableHead
              field="estado_financeiro"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Faturação
            </SortableTableHead>
            <SortableTableHead
              field="total_final"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
              align="right"
            >
              Total
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={11} className="py-16">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </TableCell>
            </TableRow>
          ) : contratos.length === 0 ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={11} className="py-16">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {totalSemFiltros === 0
                      ? 'Ainda não há contratos. Cria o primeiro!'
                      : 'Nenhum contrato corresponde à pesquisa.'}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            contratos.map((c) => (
              <TableRow
                key={c.id}
                className="border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => onRowClick(c)}
              >
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-1.5">
                    {c.codigo}
                    {c.versao > 1 && (
                      <span
                        className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                        title={`${c.versao} versões (histórico de alterações)`}
                      >
                        v{c.versao}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-foreground">{c.matricula ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{c.grupo ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {getEstacaoNome(c.estacao_entrega_id)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(c.data_inicio)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(c.data_fim)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {getClienteNome(c.cliente_id)}
                </TableCell>
                <TableCell className="text-muted-foreground">{getCondutorNome(c.id)}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <EstadoOperacionalBadge
                      estado={c.estado_operacional}
                      recolhaPendente={idsComRecolhaPendente.has(c.id)}
                    />
                    {(() => {
                      // Aviso de renovação inline (TVDE renova a cada 30 dias).
                      const renov = estadoRenovacaoContrato(c);
                      if (!renov) return null;
                      return (
                        <Badge
                          variant="outline"
                          className={cn(
                            'gap-1 font-medium',
                            renov === 'atraso'
                              ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          )}
                        >
                          <RefreshCw className="h-3 w-3" />
                          {renov === 'atraso' ? 'Renovar (atraso)' : 'Renovar hoje'}
                        </Badge>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell>
                  <EstadoFinanceiroBadge estado={c.estado_financeiro} />
                </TableCell>
                <TableCell className="text-right text-foreground whitespace-nowrap">
                  {formatCurrency(getContratoTotal(c))}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
