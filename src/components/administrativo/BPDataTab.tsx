import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Loader2,
  Search,
  Fuel,
  Euro,
  X,
  CheckCircle2,
  MapPin,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { matchesSearch } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isThisWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

// Semana: Segunda (1) a Domingo (0) — igual ao resumo
const WEEK_STARTS_ON = 1;

// Atalhos rápidos para seleção de semanas
const getWeekShortcuts = () => [
  { label: 'Esta semana', date: new Date() },
  { label: 'Semana passada', date: subWeeks(new Date(), 1) },
  { label: 'Há 2 semanas', date: subWeeks(new Date(), 2) },
  { label: 'Há 3 semanas', date: subWeeks(new Date(), 3) },
];

interface BpTransacao {
  id: string;
  transaction_date: string;
  amount: number | null;
  quantity: number | null;
  fuel_type: string | null;
  station_name: string | null;
  station_location: string | null;
  card_number: string | null;
  motorista_id: string | null;
  motorista?: { nome: string };
  integracao_id: string;
  integracao?: { nome: string };
}

interface Integracao {
  id: string;
  nome: string;
  ativo: boolean;
  plataforma: string;
  robot_target_platform?: string | null;
}

export const BPDataTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [transacoes, setTransacoes] = useState<BpTransacao[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIntegracao, setSelectedIntegracao] = useState('all');
  // Estado: data dentro da semana selecionada (default: semana passada)
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));

  // Semana selecionada: Segunda a Domingo
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const isCurrentWeek = isThisWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekShortcuts = getWeekShortcuts();
  const goToPreviousWeek = () => setSelectedWeek((d) => subWeeks(d, 1));
  const goToNextWeek = () => setSelectedWeek((d) => addWeeks(d, 1));
  const handleDayClick = (day: Date | undefined) => {
    if (day) setSelectedWeek(day);
  };
  const getWeekLabel = () => {
    const label = `${format(weekStart, 'dd/MM', { locale: pt })} - ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
    return isCurrentWeek ? `${label} (Semana Actual)` : label;
  };

  useEffect(() => {
    fetchIntegracoes();
  }, []);

  useEffect(() => {
    fetchTransacoes();
  }, [selectedIntegracao, selectedWeek]);

  const fetchIntegracoes = async () => {
    try {
      const { data, error } = await supabase
        .from('plataformas_configuracao')
        .select('id, nome, ativo, plataforma, robot_target_platform')
        .or('plataforma.eq.bp,and(plataforma.eq.robot,robot_target_platform.eq.bp)')
        .order('nome');
      if (error) throw error;
      setIntegracoes((data || []) as Integracao[]);
    } catch (error) {
      console.error('Erro ao carregar integrações:', error);
    }
  };

  const fetchTransacoes = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bp_transacoes')
        .select(
          `
          *,
          motorista:motoristas_ativos!bp_transacoes_motorista_id_fkey (nome),
          integracao:plataformas_configuracao!bp_transacoes_integracao_id_fkey (nome)
        `
        )
        .order('transaction_date', { ascending: false });

      // Fronteira de semana por data UTC (igual ao resumo) para o bucket ficar correto
      const weekStartUtc = `${format(weekStart, 'yyyy-MM-dd')}T00:00:00Z`;
      const weekEndUtc = `${format(weekEnd, 'yyyy-MM-dd')}T23:59:59Z`;
      query = query.gte('transaction_date', weekStartUtc).lte('transaction_date', weekEndUtc);
      if (selectedIntegracao !== 'all') {
        query = query.eq('integracao_id', selectedIntegracao);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransacoes((data || []) as unknown as BpTransacao[]);
    } catch (error: any) {
      console.error('Erro ao carregar transações BP:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as transações BP.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredTransacoes = useMemo(() => {
    if (!searchTerm) return transacoes;
    return transacoes.filter(
      (t) =>
        matchesSearch(t.motorista?.nome, searchTerm) ||
        matchesSearch(t.fuel_type, searchTerm) ||
        matchesSearch(t.station_name, searchTerm)
    );
  }, [transacoes, searchTerm]);

  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(
      filteredTransacoes,
      25,
      `${searchTerm}|${selectedIntegracao}|${weekStart.toISOString()}|${weekEnd.toISOString()}`
    );

  const stats = useMemo(() => {
    const total = filteredTransacoes.length;
    const totalLitros = filteredTransacoes.reduce((sum, t) => sum + (t.quantity || 0), 0);
    const totalValor = filteredTransacoes.reduce((sum, t) => sum + (t.amount || 0), 0);
    return { total, totalLitros, totalValor };
  }, [filteredTransacoes]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedIntegracao('all');
    setSelectedWeek(subWeeks(new Date(), 1));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-center text-center font-normal min-w-[260px]"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {getWeekLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                <div className="p-3 border-b">
                  <div className="flex flex-wrap gap-1.5">
                    {weekShortcuts.map((shortcut) => (
                      <Button
                        key={shortcut.label}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setSelectedWeek(shortcut.date)}
                      >
                        {shortcut.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <Calendar
                  initialFocus
                  mode="single"
                  defaultMonth={selectedWeek}
                  selected={selectedWeek}
                  onSelect={handleDayClick}
                  numberOfMonths={2}
                  locale={pt}
                  weekStartsOn={WEEK_STARTS_ON}
                  className="pointer-events-auto"
                  modifiers={{
                    selected: { from: weekStart, to: weekEnd },
                  }}
                  modifiersStyles={{
                    selected: {
                      backgroundColor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      borderRadius: 0,
                    },
                  }}
                />
                <div className="p-2 text-center text-xs text-muted-foreground border-t bg-muted/50">
                  Clique num dia para selecionar a semana inteira (Seg-Dom)
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={goToNextWeek} disabled={isCurrentWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Select value={selectedIntegracao} onValueChange={setSelectedIntegracao}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Integração" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as integrações</SelectItem>
              {integracoes.map((int) => (
                <SelectItem key={int.id} value={int.id}>
                  {int.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar motorista ou posto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {(searchTerm || selectedIntegracao !== 'all') && (
            <Button variant="ghost" size="icon" onClick={handleClearFilters}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm text-muted-foreground">
              Dados de combustível importados da BP
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Fuel className="h-4 w-4" />
              Transações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Fuel className="h-4 w-4" />
              Total Litros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats.totalLitros.toLocaleString('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                useGrouping: true,
              })}{' '}
              L
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Custo Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-400">
              €
              {stats.totalValor.toLocaleString('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                useGrouping: true,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredTransacoes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <Fuel className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma transação BP encontrada no período.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Cartão</TableHead>
                <TableHead>Posto / Localização</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {format(new Date(t.transaction_date), 'dd/MM/yyyy HH:mm', { locale: pt })}
                  </TableCell>
                  <TableCell>
                    {t.motorista?.nome || (
                      <span className="text-muted-foreground text-xs italic">Não identificado</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.card_number || '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{t.station_name || '-'}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {t.station_location || '-'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal capitalize">
                      {t.fuel_type || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {t.quantity?.toLocaleString('pt-PT', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                      useGrouping: true,
                    })}{' '}
                    L
                  </TableCell>
                  <TableCell className="text-right font-bold text-orange-400">
                    €
                    {t.amount?.toLocaleString('pt-PT', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                      useGrouping: true,
                    })}
                  </TableCell>
                </TableRow>
              ))}
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
              noun={['transacao', 'transacoes']}
              pageSizeStr={pageSizeStr}
              onPageSizeChange={setPageSizeStr}
            />
          )}
        </div>
      )}
    </div>
  );
};
