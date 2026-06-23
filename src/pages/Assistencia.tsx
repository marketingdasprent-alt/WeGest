import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Car,
  User,
  UserCheck,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { matchesSearch } from '@/lib/utils';

import type { TicketEnriched as Ticket, TicketCategoria as Categoria } from '@/types/ticket';
import { statusConfig, prioridadeConfig } from '@/lib/ticketsConfig';

interface Criador {
  id: string;
  nome: string;
}

const Assistencia = () => {
  const { user } = useAuth();
  const { isAdmin, hasAccessToResource } = usePermissions();
  const isAssistanceManager = hasAccessToResource('assistencia_tickets');
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [criadores, setCriadores] = useState<Criador[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(
    sessionStorage.getItem('assistencia_searchTerm') || ''
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    sessionStorage.getItem('assistencia_statusFilter') || 'pendentes'
  );
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>(
    sessionStorage.getItem('assistencia_prioridadeFilter') || 'todos'
  );
  const [categoriaFilter, setCategoriaFilter] = useState<string>(
    sessionStorage.getItem('assistencia_categoriaFilter') || 'todos'
  );
  const [criadorFilter, setCriadorFilter] = useState<string>(
    sessionStorage.getItem('assistencia_criadorFilter') || 'todos'
  );
  const [atribuidoFilter, setAtribuidoFilter] = useState<string>(
    sessionStorage.getItem('assistencia_atribuidoFilter') || 'todos'
  );

  // Persist filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('assistencia_searchTerm', searchTerm);
    sessionStorage.setItem('assistencia_statusFilter', statusFilter);
    sessionStorage.setItem('assistencia_prioridadeFilter', prioridadeFilter);
    sessionStorage.setItem('assistencia_categoriaFilter', categoriaFilter);
    sessionStorage.setItem('assistencia_criadorFilter', criadorFilter);
    sessionStorage.setItem('assistencia_atribuidoFilter', atribuidoFilter);
  }, [searchTerm, statusFilter, prioridadeFilter, categoriaFilter, criadorFilter, atribuidoFilter]);

  useEffect(() => {
    fetchTickets();
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    const { data } = await supabase
      .from('assistencia_categorias')
      .select('id, nome, cor')
      .eq('ativo', true)
      .order('nome');

    if (data) setCategorias(data);
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);

      const { data: ticketsData, error } = await supabase
        .from('assistencia_tickets')
        .select(
          `
          id,
          numero,
          titulo,
          descricao,
          prioridade,
          status,
          created_at,
          data_estimada,
          atribuido_a,
          criado_por,
          viatura_id,
          motorista_id,
          categoria_id
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch related data
      const viaturaIds = [
        ...new Set(ticketsData?.map((t) => t.viatura_id).filter(Boolean)),
      ] as string[];
      const motoristaIds = [
        ...new Set(ticketsData?.map((t) => t.motorista_id).filter(Boolean)),
      ] as string[];
      const categoriaIds = [
        ...new Set(ticketsData?.map((t) => t.categoria_id).filter(Boolean)),
      ] as string[];
      const criadorIds = [
        ...new Set(ticketsData?.map((t) => t.criado_por).filter(Boolean)),
      ] as string[];
      const atribuidoIds = [
        ...new Set(ticketsData?.map((t) => t.atribuido_a).filter(Boolean)),
      ] as string[];
      const allUserIds = [...new Set([...criadorIds, ...atribuidoIds])];

      const [viaturasRes, motoristasRes, categoriasRes, usersRes] = await Promise.all([
        viaturaIds.length > 0
          ? supabase.from('viaturas').select('id, matricula, marca, modelo').in('id', viaturaIds)
          : Promise.resolve({ data: [] }),
        motoristaIds.length > 0
          ? supabase.from('motoristas_ativos').select('id, nome').in('id', motoristaIds)
          : Promise.resolve({ data: [] }),
        categoriaIds.length > 0
          ? supabase.from('assistencia_categorias').select('id, nome, cor').in('id', categoriaIds)
          : Promise.resolve({ data: [] }),
        allUserIds.length > 0
          ? supabase.from('profiles').select('id, nome').in('id', allUserIds)
          : Promise.resolve({ data: [] }),
      ]);

      const viaturasMap = new Map((viaturasRes.data || []).map((v) => [v.id, v]));
      const motoristasMap = new Map((motoristasRes.data || []).map((m) => [m.id, m]));
      const categoriasMap = new Map((categoriasRes.data || []).map((c) => [c.id, c]));
      const usersMap = new Map((usersRes.data || []).map((p) => [p.id, p]));

      // Build unique creators list for filter
      const uniqueCriadores = (usersRes.data || []).filter((u) => criadorIds.includes(u.id));
      setCriadores(uniqueCriadores);

      const enrichedTickets = (ticketsData || []).map((ticket) => ({
        ...ticket,
        viatura: ticket.viatura_id ? viaturasMap.get(ticket.viatura_id) || null : null,
        motorista: ticket.motorista_id ? motoristasMap.get(ticket.motorista_id) || null : null,
        categoria: ticket.categoria_id ? categoriasMap.get(ticket.categoria_id) || null : null,
        criador: ticket.criado_por ? usersMap.get(ticket.criado_por) || null : null,
      }));

      setTickets(enrichedTickets as Ticket[]);
    } catch (error: any) {
      console.error('Erro ao carregar tickets:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os tickets.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAtribuirAMim = async (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const { error } = await supabase
        .from('assistencia_tickets')
        .update({
          atribuido_a: user?.id,
          status: 'em_andamento',
        })
        .eq('id', ticketId);

      if (error) throw error;

      toast({
        title: 'Ticket atribuído',
        description: 'O ticket foi atribuído a si.',
      });

      fetchTickets();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atribuir o ticket.',
        variant: 'destructive',
      });
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearchResult =
      matchesSearch(ticket.titulo, searchTerm) ||
      matchesSearch(ticket.viatura?.matricula, searchTerm) ||
      ticket.numero.toString().includes(searchTerm) ||
      matchesSearch(ticket.criador?.nome, searchTerm);

    // Status filter - "pendentes" shows open, in progress, and waiting
    let matchesStatus = true;
    if (statusFilter === 'pendentes') {
      matchesStatus = ['pendente', 'aberto', 'em_andamento', 'aguardando'].includes(ticket.status);
    } else if (statusFilter !== 'todos') {
      matchesStatus = ticket.status === statusFilter;
    }

    const matchesPrioridade =
      prioridadeFilter === 'todos' || ticket.prioridade === prioridadeFilter;
    const matchesCategoria =
      categoriaFilter === 'todos' || ticket.categoria?.id === categoriaFilter;
    const matchesCriador = criadorFilter === 'todos' || ticket.criador?.id === criadorFilter;

    let matchesAtribuido = true;
    if (atribuidoFilter === 'meus') {
      matchesAtribuido = ticket.atribuido_a === user?.id;
    } else if (atribuidoFilter === 'nao_atribuidos') {
      matchesAtribuido = !ticket.atribuido_a;
    }

    // Visibility rule: Only managers, admins or the creator can see pending tickets
    const canSeePendente = isAdmin || isAssistanceManager || ticket.criador?.id === user?.id;
    if (ticket.status === 'pendente' && !canSeePendente) return false;

    return (
      matchesSearchResult &&
      matchesStatus &&
      matchesPrioridade &&
      matchesCategoria &&
      matchesCriador &&
      matchesAtribuido
    );
  });

  const stats = {
    porResolver: tickets.filter((t) =>
      ['pendente', 'aberto', 'em_andamento', 'aguardando'].includes(t.status)
    ).length,
    meus: tickets.filter(
      (t) => t.atribuido_a === user?.id && !['resolvido', 'fechado'].includes(t.status)
    ).length,
    naoAtribuidos: tickets.filter(
      (t) => !t.atribuido_a && !['resolvido', 'fechado'].includes(t.status)
    ).length,
    resolvidosHoje: tickets.filter((t) => {
      if (t.status !== 'resolvido') return false;
      const today = new Date().toDateString();
      return new Date(t.created_at).toDateString() === today;
    }).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StickyPageHeader
        title="Gestão de Assistência"
        description="Gerir e resolver tickets de suporte e reparações"
        icon={Wrench}
      >
        <Button onClick={() => navigate('/assistencia/nova')}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Assistência
        </Button>
      </StickyPageHeader>

      {/* Stats Cards - Focused on Management */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer transition-all ${atribuidoFilter === 'todos' && statusFilter === 'pendentes' ? 'ring-2 ring-primary' : 'hover:bg-accent/50'}`}
          onClick={() => {
            setAtribuidoFilter('todos');
            setStatusFilter('pendentes');
          }}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-500">{stats.porResolver}</div>
            <p className="text-xs text-muted-foreground">Por Resolver</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${atribuidoFilter === 'nao_atribuidos' ? 'ring-2 ring-primary' : 'hover:bg-accent/50'}`}
          onClick={() => {
            setAtribuidoFilter('nao_atribuidos');
            setStatusFilter('pendentes');
          }}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-500">{stats.naoAtribuidos}</div>
            <p className="text-xs text-muted-foreground">Não Atribuídos</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${atribuidoFilter === 'meus' ? 'ring-2 ring-primary' : 'hover:bg-accent/50'}`}
          onClick={() => {
            setAtribuidoFilter('meus');
            setStatusFilter('pendentes');
          }}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-500">{stats.meus}</div>
            <p className="text-xs text-muted-foreground">Atribuídos a Mim</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${statusFilter === 'resolvido' ? 'ring-2 ring-primary' : 'hover:bg-accent/50'}`}
          onClick={() => {
            setAtribuidoFilter('todos');
            setStatusFilter('resolvido');
          }}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">{stats.resolvidosHoje}</div>
            <p className="text-xs text-muted-foreground">Resolvidos Hoje</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por título, matrícula, número ou criador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os estados</SelectItem>
              <SelectItem value="pendentes">Pendentes</SelectItem>
              <SelectItem value="pendente">Pendente de Aprovação</SelectItem>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="em_andamento">Em Manutenção</SelectItem>
              <SelectItem value="aguardando">Aguardando Peças</SelectItem>
              <SelectItem value="resolvido">Concluído</SelectItem>
              <SelectItem value="fechado">Fechado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas prioridades</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas categorias</SelectItem>
              {categorias.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={criadorFilter} onValueChange={setCriadorFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Criado por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os criadores</SelectItem>
              {criadores.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={atribuidoFilter} onValueChange={setAtribuidoFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Atribuição" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="meus">Atribuídos a mim</SelectItem>
              <SelectItem value="nao_atribuidos">Não atribuídos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tickets List */}
      {filteredTickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum ticket encontrado</h3>
            <p className="text-muted-foreground">
              {searchTerm ||
              statusFilter !== 'pendentes' ||
              prioridadeFilter !== 'todos' ||
              categoriaFilter !== 'todos' ||
              criadorFilter !== 'todos'
                ? 'Tente ajustar os filtros de pesquisa.'
                : 'Não existem tickets pendentes de resolução.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/assistencia/${ticket.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Left: Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-mono text-muted-foreground">
                        #{String(ticket.numero).padStart(4, '0')}
                      </span>
                      {ticket.categoria && (
                        <Badge
                          variant="outline"
                          style={{ borderColor: ticket.categoria.cor, color: ticket.categoria.cor }}
                        >
                          {ticket.categoria.nome}
                        </Badge>
                      )}
                      <Badge
                        className={prioridadeConfig[ticket.prioridade]?.color || 'bg-gray-400'}
                      >
                        {prioridadeConfig[ticket.prioridade]?.label || ticket.prioridade}
                      </Badge>
                    </div>

                    <h3 className="font-semibold text-foreground truncate">{ticket.titulo}</h3>

                    {/* Creator info - highlighted */}
                    <div className="flex items-center gap-2 mt-1 text-sm">
                      <span className="text-muted-foreground">Criado por:</span>
                      <span className="font-medium text-primary">
                        {ticket.criador?.nome || 'Desconhecido'}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Vehicle & Driver */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    {ticket.viatura && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Car className="h-4 w-4" />
                        <span>{ticket.viatura.matricula}</span>
                      </div>
                    )}
                    {ticket.motorista && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>{ticket.motorista.nome}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Status, Date & Actions */}
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">
                        {format(new Date(ticket.created_at), 'dd MMM yyyy', { locale: pt })}
                      </div>
                    </div>

                    <Badge
                      className={`${statusConfig[ticket.status]?.color || 'bg-gray-500'} flex items-center gap-1`}
                    >
                      {statusConfig[ticket.status]?.icon}
                      {statusConfig[ticket.status]?.label || ticket.status}
                    </Badge>

                    {/* Quick action: Assign to me */}
                    {!ticket.atribuido_a && ticket.status === 'aberto' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleAtribuirAMim(ticket.id, e)}
                        className="shrink-0"
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Atribuir
                      </Button>
                    )}

                    {ticket.atribuido_a === user?.id && (
                      <Badge variant="secondary" className="shrink-0">
                        <UserCheck className="h-3 w-3 mr-1" />
                        Meu
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Assistencia;
