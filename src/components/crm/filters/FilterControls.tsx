import React, { useState, useEffect } from 'react';
import { Search, Filter, Tag, User, Calendar as CalendarIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CampaignTagsManager } from '../CampaignTagsManager';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { FilterState } from '../CRMFilters';
import { supabase } from '@/integrations/supabase/client';

interface FilterControlsProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  statusColumns: { id: string; title: string; color: string; icon: string }[];
  availableTags: string[];
}

export const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  onFilterChange,
  statusColumns,
  availableTags,
}) => {
  const [usuarios, setUsuarios] = useState<{ nome: string }[]>([]);

  // Recarregar a lista de usuários sempre que o componente for montado
  useEffect(() => {
    fetchUsuarios();

    // Também recarregar quando houver mudanças nos perfis
    const channel = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsuarios();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUsuarios = async () => {
    try {
      // Buscar o ID do cargo "Gestor TVDE"
      const { data: cargoData } = await supabase
        .from('cargos')
        .select('id')
        .eq('nome', 'Gestor TVDE')
        .maybeSingle();

      if (!cargoData) {
        console.error('Cargo "Gestor TVDE" não encontrado');
        return;
      }

      // Buscar profiles pelo cargo_id (foreign key - mais confiável)
      const { data, error } = await supabase
        .from('profiles')
        .select('nome')
        .not('nome', 'is', null)
        .eq('cargo_id', cargoData.id)
        .order('nome');

      if (error) throw error;
      const uniqueNomes = Array.from(new Set((data || []).map((u) => u.nome))).map((nome) => ({
        nome,
      }));
      setUsuarios(uniqueNomes);

      // Também buscar gestores ativos (que têm leads atribuídos)
      const { data: gestores, error: gestoresError } = await supabase.rpc('get_gestores');
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    }
  };

  const updateFilters = (newFilters: Partial<FilterState>) => {
    onFilterChange(newFilters);
  };

  return (
    <div className="space-y-4">
      {/* Primeira linha: Busca, Status e Usuários */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
        {/* Search - ocupa 6 colunas */}
        <div className="relative col-span-1 sm:col-span-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Pesquisar por nome, email ou telefone..."
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="pl-10 bg-card/50 border-border text-foreground placeholder:text-muted-foreground focus:border-ring w-full"
          />
        </div>

        {/* Status Filter - ocupa 3 colunas */}
        <div className="col-span-1 sm:col-span-3">
          <Select
            value={filters.status}
            onValueChange={(value) => updateFilters({ status: value })}
          >
            <SelectTrigger className="w-full bg-card/50 border-border text-foreground">
              <Filter className="h-4 w-4 mr-2 flex-shrink-0" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              <SelectItem value="todos" className="text-foreground hover:bg-muted">
                Todos os Status
              </SelectItem>
              {statusColumns.map((status) => (
                <SelectItem
                  key={status.id}
                  value={status.id}
                  className="text-foreground hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <span>{status.icon}</span>
                    {status.title}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* User Filter - ocupa 3 colunas */}
        <div className="col-span-1 sm:col-span-3">
          <Select
            value={filters.userId}
            onValueChange={(value) => updateFilters({ userId: value })}
          >
            <SelectTrigger className="w-full bg-card/50 border-border text-foreground">
              <User className="h-4 w-4 mr-2 flex-shrink-0" />
              <SelectValue placeholder="Usuário" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              <SelectItem value="todos" className="text-foreground hover:bg-muted">
                Todos os Usuários
              </SelectItem>
              {usuarios
                .filter((u) => u.nome && u.nome.trim() !== '')
                .map((usuario) => (
                  <SelectItem
                    key={usuario.nome}
                    value={usuario.nome}
                    className="text-foreground hover:bg-muted"
                  >
                    {usuario.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Segunda linha: Período personalizado e Campanhas */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
        {/* Data início - ocupa 3 colunas */}
        <div className="col-span-1 sm:col-span-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal bg-card/50 border-border text-foreground hover:bg-muted',
                  !filters.customStartDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  {filters.customStartDate
                    ? format(filters.customStartDate, 'dd/MM/yyyy', { locale: ptBR })
                    : 'Data início'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-card border-border z-50" align="start">
              <Calendar
                mode="single"
                selected={filters.customStartDate}
                onSelect={(date) => {
                  updateFilters({
                    customStartDate: date,
                    dateRange: 'customizado',
                  });
                }}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Data fim - ocupa 3 colunas */}
        <div className="col-span-1 sm:col-span-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal bg-card/50 border-border text-foreground hover:bg-muted',
                  !filters.customEndDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  {filters.customEndDate
                    ? format(filters.customEndDate, 'dd/MM/yyyy', { locale: ptBR })
                    : 'Data fim'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-card border-border z-50" align="start">
              <Calendar
                mode="single"
                selected={filters.customEndDate}
                onSelect={(date) => {
                  updateFilters({
                    customEndDate: date,
                    dateRange: 'customizado',
                  });
                }}
                initialFocus
                disabled={(date) =>
                  filters.customStartDate ? date < filters.customStartDate : false
                }
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Campaign Tags Filter - ocupa 5 colunas */}
        <div className="col-span-1 sm:col-span-5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full bg-card/50 border-border text-foreground hover:bg-muted justify-start"
              >
                <Tag className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">Campanhas</span>
                {filters.campaignTags.length > 0 && (
                  <Badge className="ml-2 bg-yellow-500/20 text-yellow-300 border-yellow-500/30 flex-shrink-0">
                    {filters.campaignTags.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-card border-border p-4 z-50">
              <CampaignTagsManager
                tags={filters.campaignTags}
                onTagsChange={(tags) => updateFilters({ campaignTags: tags })}
                availableTags={availableTags}
                placeholder="Filtrar por campanha..."
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Botão para limpar datas - ocupa 1 coluna */}
        {(filters.customStartDate || filters.customEndDate) && (
          <div className="col-span-1 sm:col-span-1">
            <Button
              onClick={() =>
                updateFilters({
                  dateRange: 'todos',
                  customStartDate: undefined,
                  customEndDate: undefined,
                })
              }
              variant="outline"
              size="icon"
              className="bg-card/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground w-full"
              title="Limpar datas"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
