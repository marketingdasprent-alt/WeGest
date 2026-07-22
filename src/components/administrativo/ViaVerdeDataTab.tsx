import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
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
  MapPin,
  Euro,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isThisWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn, matchesSearch } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

const WEEK_STARTS_ON = 1;

const getWeekShortcuts = () => [
  { label: 'Esta semana', date: new Date() },
  { label: 'Semana passada', date: subWeeks(new Date(), 1) },
  { label: 'Há 2 semanas', date: subWeeks(new Date(), 2) },
  { label: 'Há 3 semanas', date: subWeeks(new Date(), 3) },
];

interface Transacao {
  id: string;
  transaction_date: string;
  amount: number | null;
  matricula: string | null;
  nr_equipamento: string | null;
  barreira_entrada: string | null;
  barreira_saida: string | null;
  operador: string | null;
  tipo_evento: string | null;
  contrato: string | null;
  motorista_id: string | null;
  motorista?: { nome: string };
  integracao_id: string;
}

interface Integracao {
  id: string;
  nome: string;
  ativo: boolean;
}

export const ViaVerdeDataTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIntegracao, setSelectedIntegracao] = useState('all');
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));
  const [sortField, setSortField] = useState<string>('transaction_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIntegracao, selectedWeek]);

  const fetchIntegracoes = async () => {
    try {
      const { data, error } = await supabase
        .from('plataformas_configuracao')
        .select('id, nome, ativo')
        .eq('plataforma', 'via_verde')
        .order('nome');
      if (error) throw error;
      setIntegracoes((data || []) as Integracao[]);
    } catch (error) {
      console.error('Erro ao carregar integrações Via Verde:', error);
    }
  };

  const fetchTransacoes = async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('via_verde_transacoes')
        .select(`*, motorista:motoristas_ativos (nome)`)
        .order('transaction_date', { ascending: false });

      const weekStartUtc = `${format(weekStart, 'yyyy-MM-dd')}T00:00:00Z`;
      const weekEndUtc = `${format(weekEnd, 'yyyy-MM-dd')}T23:59:59Z`;
      query = query.gte('transaction_date', weekStartUtc).lte('transaction_date', weekEndUtc);
      if (selectedIntegracao !== 'all') query = query.eq('integracao_id', selectedIntegracao);

      const { data, error } = await query;
      if (error) throw error;
      setTransacoes((data || []) as Transacao[]);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Falha ao carregar dados Via Verde.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filtered = transacoes
    .filter(
      (t) =>
        !searchTerm ||
        matchesSearch(t.motorista?.nome, searchTerm) ||
        matchesSearch(t.matricula, searchTerm) ||
        matchesSearch(t.barreira_entrada, searchTerm) ||
        matchesSearch(t.barreira_saida, searchTerm) ||
        matchesSearch(t.operador, searchTerm)
    )
    .sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortField) {
        case 'transaction_date':
          va = a.transaction_date;
          vb = b.transaction_date;
          break;
        case 'matricula':
          va = a.matricula || '';
          vb = b.matricula || '';
          break;
        case 'motorista':
          va = a.motorista?.nome || '';
          vb = b.motorista?.nome || '';
          break;
        case 'barreira_entrada':
          va = a.barreira_entrada || '';
          vb = b.barreira_entrada || '';
          break;
        case 'barreira_saida':
          va = a.barreira_saida || '';
          vb = b.barreira_saida || '';
          break;
        case 'operador':
          va = a.operador || '';
          vb = b.operador || '';
          break;
        case 'amount':
          va = a.amount || 0;
          vb = b.amount || 0;
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const stats = {
    total: filtered.length,
    matriculas: new Set(filtered.map((t) => t.matricula).filter(Boolean)).size,
    valor: filtered.reduce((s, t) => s + (t.amount || 0), 0),
  };

  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(
      filtered,
      25,
      `${searchTerm}|${selectedIntegracao}|${weekStart.toISOString()}|${weekEnd.toISOString()}`
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
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
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Integração" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {integracoes.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Matrícula, barreira, operador, motorista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Portagens" value={stats.total} icon={<MapPin className="h-4 w-4" />} />
        <StatCard
          title="Matrículas"
          value={stats.matriculas}
          icon={<MapPin className="h-4 w-4" />}
        />
        <StatCard
          title="Custo Total"
          value={`€${stats.valor.toFixed(2)}`}
          icon={<Euro className="h-4 w-4" />}
          color="text-emerald-500"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="animate-spin mx-auto" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  field="transaction_date"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Data
                </SortableTableHead>
                <SortableTableHead
                  field="matricula"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Matrícula
                </SortableTableHead>
                <SortableTableHead
                  field="motorista"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Motorista
                </SortableTableHead>
                <SortableTableHead
                  field="barreira_entrada"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Entrada
                </SortableTableHead>
                <SortableTableHead
                  field="barreira_saida"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Saída
                </SortableTableHead>
                <SortableTableHead
                  field="operador"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Operador
                </SortableTableHead>
                <SortableTableHead
                  field="amount"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                >
                  Valor
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{format(new Date(t.transaction_date), 'dd/MM/yyyy HH:mm')}</TableCell>
                  <TableCell className="font-mono text-xs">{t.matricula || '-'}</TableCell>
                  <TableCell>
                    {t.motorista?.nome || (
                      <span className="italic text-muted-foreground">Não ident.</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate">
                    {t.barreira_entrada || '-'}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate">
                    {t.barreira_saida || '-'}
                  </TableCell>
                  <TableCell>{t.operador || '-'}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-500">
                    €{t.amount?.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!loading && total > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            noun={['portagem', 'portagens']}
            pageSizeStr={pageSizeStr}
            onPageSizeChange={setPageSizeStr}
          />
        )}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }: any) => (
  <Card className="border-border/50 bg-card/50">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
    </CardContent>
  </Card>
);
