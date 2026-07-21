import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  zona?: string;
  data_aluguer?: string;
  tipo_viatura?: string;
  valor_negocio?: string;
  tem_formacao_tvde?: boolean;
  status: string;
  campaign_tags?: string[];
  created_at: string;
  formulario_id?: string;
  observacoes?: string;
  observacoes_gestores?: string;
  gestor_responsavel?: string;
}

interface StatusColumn {
  id: string;
  title: string;
  color: string;
  icon: string;
}

interface CRMListViewProps {
  leads: Lead[];
  statusColumns: StatusColumn[];
  getTagsForFormulario: (formularioId?: string) => string[];
}

const statusColorMap: Record<string, string> = {
  novo: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  contactado: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  interessado: 'bg-green-500/20 text-green-400 border-green-500/50',
  convertido: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  perdido: 'bg-red-500/20 text-red-400 border-red-500/50',
};

const statusLabelMap: Record<string, string> = {
  novo: 'Novo',
  contactado: 'Contactado',
  interessado: 'Interessado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

const tipoViaturaColorMap: Record<string, string> = {
  comfort: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  black: 'bg-gray-800/40 text-gray-300 border-gray-600/50',
  green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
  'x-saver': 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  van: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
};

export const CRMListView: React.FC<CRMListViewProps> = ({
  leads,
  statusColumns,
  getTagsForFormulario,
}) => {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy', { locale: pt });
    } catch {
      return '-';
    }
  };

  const formatDataAluguer = (data?: string) => {
    if (!data) return '-';
    try {
      return format(new Date(data), 'dd MMM', { locale: pt });
    } catch {
      return data;
    }
  };

  const formatValor = (valor?: string) => {
    if (!valor) return '-';
    if (valor.includes('€') || valor.includes('EUR')) return valor;
    return `${valor}€`;
  };

  const sortedLeads = useMemo(() => {
    const list = [...leads];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'nome') {
        va = a.nome;
        vb = b.nome;
      } else if (sortField === 'email') {
        va = a.email || '';
        vb = b.email || '';
      } else if (sortField === 'telefone') {
        va = a.telefone || '';
        vb = b.telefone || '';
      } else if (sortField === 'tipo_viatura') {
        va = a.tipo_viatura || '';
        vb = b.tipo_viatura || '';
      } else if (sortField === 'tem_formacao_tvde') {
        va = a.tem_formacao_tvde === true ? 1 : a.tem_formacao_tvde === false ? 0 : -1;
        vb = b.tem_formacao_tvde === true ? 1 : b.tem_formacao_tvde === false ? 0 : -1;
      } else if (sortField === 'status') {
        va = a.status;
        vb = b.status;
      } else if (sortField === 'created_at') {
        va = a.created_at ? new Date(a.created_at).getTime() : 0;
        vb = b.created_at ? new Date(b.created_at).getTime() : 0;
      } else if (sortField === 'gestor_responsavel') {
        va = a.gestor_responsavel || '';
        vb = b.gestor_responsavel || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [leads, sortField, sortDir]);

  // Paginação client-side (com seletor de tamanho). O resetKey volta à 1ª página
  // quando o pai filtra (muda a contagem/1.º lead) ou quando se reordena a tabela.
  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(sortedLeads, 25, `${leads.length}|${leads[0]?.id ?? ''}|${sortField}|${sortDir}`);

  const handleRowClick = (lead: Lead) => {
    navigate(`/crm/lead/${lead.id}`);
  };

  return (
    <div className="border rounded-lg bg-card/50 backdrop-blur-sm mt-6">
      <Table className="w-full table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableTableHead
              field="nome"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Nome
            </SortableTableHead>
            <SortableTableHead
              field="telefone"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[110px]"
            >
              Telefone
            </SortableTableHead>
            <SortableTableHead
              field="status"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="w-[100px]"
            >
              Status
            </SortableTableHead>
            <SortableTableHead
              field="email"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="hidden md:table-cell w-[200px]"
            >
              Email
            </SortableTableHead>
            <SortableTableHead
              field="created_at"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="hidden md:table-cell w-[100px]"
            >
              Criado
            </SortableTableHead>
            <SortableTableHead
              field="tipo_viatura"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="hidden lg:table-cell w-[100px]"
            >
              Viatura
            </SortableTableHead>
            <SortableTableHead
              field="gestor_responsavel"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="hidden lg:table-cell w-[140px]"
            >
              Gestor
            </SortableTableHead>
            <SortableTableHead
              field="tem_formacao_tvde"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="hidden xl:table-cell w-[70px]"
            >
              Form.
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {total === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                Nenhum lead encontrado com os filtros aplicados
              </TableCell>
            </TableRow>
          ) : (
            pageItems.map((lead) => {
              const tipoViaturaKey = lead.tipo_viatura?.toLowerCase().replace(' ', '-') || '';

              return (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer h-10"
                  onClick={() => handleRowClick(lead)}
                >
                  {/* Nome - flexível */}
                  <TableCell
                    className="py-2 font-medium truncate overflow-hidden"
                    title={lead.nome}
                  >
                    {lead.nome}
                  </TableCell>

                  {/* Telefone - com link para WhatsApp */}
                  <TableCell
                    className="py-2 font-mono text-sm w-[110px] max-w-[110px] truncate overflow-hidden"
                    title={lead.telefone || '-'}
                  >
                    {lead.telefone ? (
                      <a
                        href={`https://wa.me/${lead.telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-green-500 hover:text-green-400 hover:underline flex items-center gap-1"
                      >
                        <MessageCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{lead.telefone}</span>
                      </a>
                    ) : (
                      '-'
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell className="py-2 w-[100px]">
                    <Badge
                      variant="outline"
                      className={cn('text-xs border', statusColorMap[lead.status] || '')}
                    >
                      {statusLabelMap[lead.status] || lead.status}
                    </Badge>
                  </TableCell>

                  {/* Email - com link mailto */}
                  <TableCell
                    className="py-2 truncate overflow-hidden hidden md:table-cell w-[200px] max-w-[200px]"
                    title={lead.email || ''}
                  >
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                      >
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </a>
                    ) : (
                      '-'
                    )}
                  </TableCell>

                  {/* Criado */}
                  <TableCell className="py-2 text-muted-foreground text-sm hidden md:table-cell w-[100px]">
                    {formatDate(lead.created_at)}
                  </TableCell>

                  {/* Tipo Viatura */}
                  <TableCell className="py-2 hidden lg:table-cell w-[100px]">
                    {lead.tipo_viatura ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs border',
                          tipoViaturaColorMap[tipoViaturaKey] || 'bg-muted text-muted-foreground'
                        )}
                      >
                        {lead.tipo_viatura}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>

                  {/* Gestor */}
                  <TableCell
                    className="py-2 text-muted-foreground text-sm truncate overflow-hidden hidden lg:table-cell w-[140px] max-w-[140px]"
                    title={lead.gestor_responsavel || ''}
                  >
                    {lead.gestor_responsavel || '-'}
                  </TableCell>

                  {/* Formação TVDE */}
                  <TableCell className="py-2 hidden xl:table-cell w-[70px]">
                    {lead.tem_formacao_tvde === true ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-green-500/20 text-green-400 border-green-500/50"
                      >
                        Sim
                      </Badge>
                    ) : lead.tem_formacao_tvde === false ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-red-500/20 text-red-400 border-red-500/50"
                      >
                        Não
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {total > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          start={start}
          end={end}
          onPageChange={setPage}
          noun={['lead', 'leads']}
          pageSizeStr={pageSizeStr}
          onPageSizeChange={setPageSizeStr}
        />
      )}
    </div>
  );
};
