import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ContratoStatusBadge } from '@/lib/statusBadges';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Download, Printer, Edit, History, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Contrato {
  id: string;
  motorista_nome: string;
  motorista_id: string;
  motorista_nif: string | null;
  motorista_morada: string | null;
  motorista_email: string | null;
  motorista_telefone: string | null;
  motorista_documento_tipo: string | null;
  motorista_documento_numero: string | null;
  empresa_id: string;
  data_inicio: string;
  data_assinatura: string;
  cidade_assinatura: string;
  status: string;
  versao: number;
  documento_url: string | null;
  criado_em: string;
  duracao_meses: number;
  template_id: string | null;
}

interface MotoristGroup {
  motorista_id: string;
  motorista_nome: string;
  total_contratos: number;
  contratos_ativos: number;
  empresas: string[];
  ultimo_contrato: Contrato;
  contratos: Contrato[];
}

interface ContratosGroupedViewProps {
  contratos: Contrato[];
  onDownload: (contrato: Contrato) => void;
  onPrint: (contrato: Contrato) => void;
  onEdit: (contrato: Contrato) => void;
  onHistory: (contrato: Contrato) => void;
  downloadingId: string | null;
  generatingId: string | null;
}

export const ContratosGroupedView = ({
  contratos,
  onDownload,
  onPrint,
  onEdit,
  onHistory,
  downloadingId,
  generatingId,
}: ContratosGroupedViewProps) => {
  const [expandedMotoristas, setExpandedMotoristas] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>('motorista_nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  // Group contracts by motorista
  const groupedByMotorista = contratos.reduce<Record<string, MotoristGroup>>((acc, contrato) => {
    const key = contrato.motorista_id;

    if (!acc[key]) {
      acc[key] = {
        motorista_id: contrato.motorista_id,
        motorista_nome: contrato.motorista_nome,
        total_contratos: 0,
        contratos_ativos: 0,
        empresas: [],
        ultimo_contrato: contrato,
        contratos: [],
      };
    }

    acc[key].total_contratos++;

    if (contrato.status === 'ativo') {
      acc[key].contratos_ativos++;
    }

    const empresaNome = getEmpresaNome(contrato.empresa_id);
    if (!acc[key].empresas.includes(empresaNome)) {
      acc[key].empresas.push(empresaNome);
    }

    // Keep track of most recent contract
    if (new Date(contrato.criado_em) > new Date(acc[key].ultimo_contrato.criado_em)) {
      acc[key].ultimo_contrato = contrato;
    }

    acc[key].contratos.push(contrato);

    return acc;
  }, {});

  const groups = Object.values(groupedByMotorista).sort((a, b) => {
    if (sortField === 'total_contratos') {
      const va = a.total_contratos;
      const vb = b.total_contratos;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    }
    if (sortField === 'status') {
      const va = a.ultimo_contrato.status;
      const vb = b.ultimo_contrato.status;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    }
    const cmp = a.motorista_nome.localeCompare(b.motorista_nome);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleExpand = (motoristaId: string) => {
    setExpandedMotoristas((prev) => {
      const next = new Set(prev);
      if (next.has(motoristaId)) {
        next.delete(motoristaId);
      } else {
        next.add(motoristaId);
      }
      return next;
    });
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <SortableTableHead
              field="motorista_nome"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Motorista
            </SortableTableHead>
            <TableHead>Empresas</TableHead>
            <SortableTableHead
              field="total_contratos"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Contratos
            </SortableTableHead>
            <SortableTableHead
              field="status"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Status Atual
            </SortableTableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const isExpanded = expandedMotoristas.has(group.motorista_id);

            return (
              <Collapsible key={group.motorista_id} asChild open={isExpanded}>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpand(group.motorista_id)}
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{group.motorista_nome}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {group.empresas.map((empresa) => (
                            <Badge key={empresa} variant="outline" className="text-xs">
                              {empresa}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Badge variant="secondary">{group.total_contratos}</Badge>
                          {group.contratos_ativos > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({group.contratos_ativos} ativo{group.contratos_ativos > 1 ? 's' : ''}
                              )
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ContratoStatusBadge status={group.ultimo_contrato.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDownload(group.ultimo_contrato)}
                            disabled={
                              downloadingId === group.ultimo_contrato.id ||
                              generatingId === group.ultimo_contrato.id
                            }
                          >
                            {downloadingId === group.ultimo_contrato.id ||
                            generatingId === group.ultimo_contrato.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onPrint(group.ultimo_contrato)}
                            disabled={generatingId === group.ultimo_contrato.id}
                          >
                            {generatingId === group.ultimo_contrato.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Printer className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <>
                      {group.contratos
                        .sort(
                          (a, b) =>
                            new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
                        )
                        .map((contrato) => (
                          <TableRow key={contrato.id} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell className="pl-8 text-muted-foreground">
                              v{contrato.versao || 1} -{' '}
                              {format(new Date(contrato.data_inicio), 'dd/MM/yyyy', {
                                locale: ptBR,
                              })}
                            </TableCell>
                            <TableCell>{getEmpresaNome(contrato.empresa_id)}</TableCell>
                            <TableCell></TableCell>
                            <TableCell>
                              <ContratoStatusBadge status={contrato.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onDownload(contrato)}
                                  disabled={
                                    downloadingId === contrato.id || generatingId === contrato.id
                                  }
                                >
                                  {downloadingId === contrato.id || generatingId === contrato.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => onEdit(contrato)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onHistory(contrato)}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </>
                  </CollapsibleContent>
                </>
              </Collapsible>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

function getEmpresaNome(empresaId: string): string {
  return empresaId === 'decada_ousada' ? 'WeGest' : 'Distância Arrojada';
}
