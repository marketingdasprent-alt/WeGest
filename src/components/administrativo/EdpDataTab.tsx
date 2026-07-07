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
  Upload,
  CheckCircle2,
  MapPin,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isThisWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn, matchesSearch } from '@/lib/utils';
import { ImportRobotCsvDialog } from '@/components/admin/ImportRobotCsvDialog';
import { DateRange } from 'react-day-picker';
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

interface Transacao {
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
}

export const EdpDataTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
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
        .or('plataforma.eq.edp,and(plataforma.eq.robot,robot_target_platform.eq.edp)')
        .order('nome');
      if (error) throw error;
      setIntegracoes((data || []) as Integracao[]);
      if (data && data.length > 0) setSelectedIntegracao(data[0].id);
    } catch (error) {
      console.error('Erro ao carregar integrações EDP:', error);
    }
  };

  const fetchTransacoes = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('edp_transacoes')
        .select(`*, motorista:motoristas_ativos (nome), integracao:plataformas_configuracao (nome)`)
        .order('transaction_date', { ascending: false });

      // Fronteira de semana por data UTC (igual ao resumo) para o bucket ficar correto
      const weekStartUtc = `${format(weekStart, 'yyyy-MM-dd')}T00:00:00Z`;
      const weekEndUtc = `${format(weekEnd, 'yyyy-MM-dd')}T23:59:59Z`;
      query = query.gte('transaction_date', weekStartUtc).lte('transaction_date', weekEndUtc);
      if (selectedIntegracao !== 'all') query = query.eq('integracao_id', selectedIntegracao);

      const { data, error } = await query;
      if (error) throw error;
      setTransacoes((data || []) as Transacao[]);
    } catch (error: any) {
      toast({ title: 'Erro', description: 'Falha ao carregar dados EDP.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = transacoes.filter(
    (t) =>
      !searchTerm ||
      matchesSearch(t.motorista?.nome, searchTerm) ||
      matchesSearch(t.station_name, searchTerm)
  );

  const stats = {
    total: filtered.length,
    energia: filtered.reduce((s, t) => s + (t.quantity || 0), 0),
    valor: filtered.reduce((s, t) => s + (t.amount || 0), 0),
  };

  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(
      filtered,
      25,
      `${searchTerm}|${selectedIntegracao}|${dateRange?.from?.toISOString() ?? ''}|${
        dateRange?.to?.toISOString() ?? ''
      }`
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
            placeholder="Pesquisar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Carregamentos" value={stats.total} icon={<Zap className="h-4 w-4" />} />
        <StatCard
          title="Total Energia"
          value={`${stats.energia.toFixed(2)} kWh`}
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          title="Custo Total"
          value={`€${stats.valor.toFixed(2)}`}
          icon={<Euro className="h-4 w-4" />}
          color="text-green-500"
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
                <TableHead>Data</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Cartão</TableHead>
                <TableHead>Ponto de Carga</TableHead>
                <TableHead className="text-right">Energia</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{format(new Date(t.transaction_date), 'dd/MM/yyyy HH:mm')}</TableCell>
                  <TableCell>
                    {t.motorista?.nome || (
                      <span className="italic text-muted-foreground">Não ident.</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.card_number || '-'}</TableCell>
                  <TableCell>{t.station_name || '-'}</TableCell>
                  <TableCell className="text-right font-medium">
                    {t.quantity?.toFixed(2)} kWh
                  </TableCell>
                  <TableCell className="text-right font-bold text-green-500">
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
            noun={['transacao', 'transacoes']}
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
