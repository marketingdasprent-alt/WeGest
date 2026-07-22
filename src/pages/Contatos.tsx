import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Search, Mail, Phone, MapPin, Calendar, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CRMFilters, FilterState } from '@/components/crm/CRMFilters';
import { useCampaignTags } from '@/hooks/useCampaignTags';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  zona?: string;
  data_aluguer?: string;
  status: string;
  campaign_tags?: string[];
  created_at: string;
  formulario_id?: string;
  observacoes?: string;
}

const statusColors = {
  novo: 'bg-blue-500',
  contactado: 'bg-yellow-500',
  interessado: 'bg-green-500',
  convertido: 'bg-purple-500',
  perdido: 'bg-red-500',
};

const statusLabels = {
  novo: 'Novo',
  contactado: 'Contactado',
  interessado: 'Interessado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

const statusColumns = [
  { id: 'novo', title: 'Novo', color: '#3b82f6', icon: '🆕' },
  { id: 'contactado', title: 'Contactado', color: '#eab308', icon: '📞' },
  { id: 'interessado', title: 'Interessado', color: '#22c55e', icon: '👍' },
  { id: 'convertido', title: 'Convertido', color: '#8b5cf6', icon: '✅' },
  { id: 'perdido', title: 'Perdido', color: '#ef4444', icon: '❌' },
];

const ITEMS_PER_PAGE = 50;

const Contatos = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'todos',
    dateRange: 'todos',
    campaignTags: [],
    userId: 'todos',
  });
  const { toast } = useToast();
  const { availableTags } = useCampaignTags();
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  // Função para extrair dados das observações quando campos principais estão vazios
  const getLeadDisplayData = (lead: Lead) => {
    const displayData = {
      nome: lead.nome,
      email: lead.email,
      telefone: lead.telefone,
    };

    // Se campos principais estão vazios, tentar extrair das observações
    if ((!lead.nome || !lead.email || !lead.telefone) && lead.observacoes) {
      try {
        const observacoesData = JSON.parse(lead.observacoes);

        if (typeof observacoesData === 'object' && observacoesData !== null) {
          // Mapeamento específico para os campos do formulário TVDE
          const fieldMapping: Record<string, string> = {
            field_1748938792037: 'nome',
            field_1748938798127: 'email',
            field_1748938804488: 'telefone',
            field_1748939842786: 'nome',
            field_1748939848328: 'email',
            field_1748939855085: 'telefone',
          };

          // Aplicar mapeamento específico primeiro
          Object.entries(observacoesData).forEach(([key, value]) => {
            const fieldType = fieldMapping[key];
            if (fieldType && typeof value === 'string' && value.trim()) {
              const trimmedValue = String(value).trim();
              if (fieldType === 'nome' && !displayData.nome) {
                displayData.nome = trimmedValue;
              } else if (fieldType === 'email' && !displayData.email) {
                displayData.email = trimmedValue;
              } else if (fieldType === 'telefone' && !displayData.telefone) {
                displayData.telefone = trimmedValue;
              }
            }
          });
        }
      } catch (error) {
        console.error('Erro ao extrair dados das observações:', error);
      }
    }

    return displayData;
  };

  useEffect(() => {
    fetchLeads();
  }, [currentPage, filters]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('leads_dasprent')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filters.status !== 'todos') {
        query = query.eq('status', filters.status);
      }

      if (filters.search) {
        query = query.or(
          `nome.ilike.%${filters.search}%,email.ilike.%${filters.search}%,telefone.ilike.%${filters.search}%,zona.ilike.%${filters.search}%`
        );
      }

      if (filters.campaignTags.length > 0) {
        query = query.overlaps('campaign_tags', filters.campaignTags);
      }

      // Filtros de data
      if (filters.dateRange !== 'todos') {
        const now = new Date();
        let startDate;

        switch (filters.dateRange) {
          case 'hoje':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'semana':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'mes':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case '30dias':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        }

        if (startDate) {
          query = query.gte('created_at', startDate.toISOString());
        }
      }

      // Paginação
      query = query.range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      setLeads(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar contatos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset para primeira página quando filtros mudam
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Estatísticas baseadas no total da base de dados
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // 1 query agregada (RPC) em vez de N counts:'exact' (um por status)
      // sobre leads_dasprent, a tabela de maior volume.
      const { data, error } = await (supabase as any).rpc('leads_count_by_status');
      if (error) throw error;

      const statsObj: Record<string, number> = {};
      for (const row of (data as { status: string; total: number }[]) ?? []) {
        statsObj[row.status] = Number(row.total);
      }
      setStats(statsObj);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const sortedLeads = useMemo(() => {
    const list = [...leads];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'nome') {
        va = a.nome || '';
        vb = b.nome || '';
      } else if (sortField === 'email') {
        va = a.email || '';
        vb = b.email || '';
      } else if (sortField === 'telefone') {
        va = a.telefone || '';
        vb = b.telefone || '';
      } else if (sortField === 'zona') {
        va = a.zona || '';
        vb = b.zona || '';
      } else if (sortField === 'status') {
        va = a.status || '';
        vb = b.status || '';
      } else if (sortField === 'created_at') {
        va = a.created_at || '';
        vb = b.created_at || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [leads, sortField, sortDir]);

  if (loading && currentPage === 1) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-foreground text-lg">Carregando contatos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent hidden dark:block" />
      <div className="absolute inset-0 bg-grid-foreground/[0.02] bg-[size:60px_60px] hidden dark:block" />

      <div className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-gradient-to-r from-primary/20 to-primary/20 border border-primary/30">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-foreground">Contatos</h1>
                <p className="text-xl text-muted-foreground">
                  {totalCount.toLocaleString()} leads registrados
                </p>
              </div>
            </div>
          </div>

          {/* Filtros Avançados */}
          <CRMFilters
            filters={filters} // Passar filtros atuais
            onFilterChange={handleFilterChange}
            statusColumns={statusColumns}
            totalLeads={totalCount}
            filteredCount={leads.length}
            availableTags={availableTags}
          />

          {/* Tabela de Leads */}
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <SortableTableHead
                        field="nome"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="text-muted-foreground"
                      >
                        Nome
                      </SortableTableHead>
                      <SortableTableHead
                        field="email"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="text-muted-foreground"
                      >
                        Email
                      </SortableTableHead>
                      <SortableTableHead
                        field="telefone"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="text-muted-foreground"
                      >
                        Telefone
                      </SortableTableHead>
                      <SortableTableHead
                        field="zona"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="text-muted-foreground"
                      >
                        Zona
                      </SortableTableHead>
                      <SortableTableHead
                        field="status"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="text-muted-foreground"
                      >
                        Status
                      </SortableTableHead>
                      <SortableTableHead
                        field="created_at"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="text-muted-foreground"
                      >
                        Data
                      </SortableTableHead>
                      <TableHead className="text-muted-foreground">Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLeads.map((lead) => {
                      const displayData = getLeadDisplayData(lead);
                      return (
                        <TableRow key={lead.id} className="border-border hover:bg-muted/30">
                          <TableCell className="text-foreground font-medium">
                            {displayData.nome || 'Nome não informado'}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {displayData.email ? (
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                <span className="truncate max-w-[200px]" title={displayData.email}>
                                  {displayData.email}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">
                                Email não informado
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {displayData.telefone ? (
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                {displayData.telefone}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">
                                Telefone não informado
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {lead.zona ? (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                {lead.zona}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">
                                Zona não informada
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`${statusColors[lead.status as keyof typeof statusColors]} text-white`}
                            >
                              {statusLabels[lead.status as keyof typeof statusLabels]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {new Date(lead.created_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            {lead.campaign_tags && lead.campaign_tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {lead.campaign_tags.slice(0, 2).map((tag, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {lead.campaign_tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{lead.campaign_tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic text-xs">Sem tags</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {leads.length === 0 && !loading && (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 text-muted mx-auto mb-4" />
                  <p className="text-muted-foreground text-lg">
                    {Object.values(filters).some(
                      (f) => f && (Array.isArray(f) ? f.length > 0 : f !== 'todos')
                    )
                      ? 'Nenhum contato encontrado com os filtros aplicados'
                      : 'Nenhum contato cadastrado ainda'}
                  </p>
                </div>
              )}

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-border">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                          className={
                            currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                          }
                        />
                      </PaginationItem>

                      {[...Array(Math.min(5, totalPages))].map((_, i) => {
                        const page = i + 1;
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => handlePageChange(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            currentPage < totalPages && handlePageChange(currentPage + 1)
                          }
                          className={
                            currentPage === totalPages
                              ? 'opacity-50 cursor-not-allowed'
                              : 'cursor-pointer'
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>

                  <div className="text-center mt-4">
                    <p className="text-muted-foreground text-sm">
                      Página {currentPage} de {totalPages} • {totalCount.toLocaleString()} leads
                      total
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {loading && currentPage > 1 && (
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Contatos;
