import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import {
  Loader2,
  Search,
  Car,
  Euro,
  X,
  CalendarIcon,
  StopCircle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { format, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn, matchesSearch } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { useIsMobile } from '@/hooks/use-mobile';

interface Integracao {
  id: string;
  nome: string;
  ativo: boolean;
}

interface UberTransaction {
  id: string;
  uber_transaction_id: string;
  trip_reference: string | null;
  uber_driver_id: string | null;
  uber_vehicle_id: string | null;
  transaction_type: string | null;
  status: string | null;
  currency: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  commission_amount: number | null;
  occurred_at: string | null;
  settled_at: string | null;
  integracao_id: string;
  motorista_id: string | null;
  viatura_id: string | null;
  raw_transaction: Record<string, any> | null;
  integracao?: { nome: string } | null;
}

const extractDriverNameFromRaw = (raw: Record<string, any> | null): string | null => {
  try {
    if (raw && typeof raw === 'object') {
      const csvRow = raw.csv_row as Record<string, string> | undefined;
      if (csvRow) {
        const first = csvRow['driver_first_name'] || csvRow['Nome próprio do motorista'] || '';
        const last = csvRow['driver_last_name'] || csvRow['Apelido do motorista'] || '';
        const name = `${first} ${last}`.trim();
        if (name) return name;
      }
    }
  } catch {
    /* fallback */
  }
  return null;
};

const getDriverName = (
  t: UberTransaction,
  nameMap?: Map<string, string>,
  dbMap?: Map<string, string>
): { name: string; resolved: boolean } => {
  const fromRaw = extractDriverNameFromRaw(t.raw_transaction);
  if (fromRaw) return { name: fromRaw, resolved: true };
  if (nameMap && t.uber_driver_id && nameMap.has(t.uber_driver_id)) {
    return { name: nameMap.get(t.uber_driver_id)!, resolved: true };
  }
  if (dbMap && t.uber_driver_id && dbMap.has(t.uber_driver_id)) {
    return { name: dbMap.get(t.uber_driver_id)!, resolved: true };
  }
  if (t.uber_driver_id) return { name: t.uber_driver_id, resolved: false };
  return { name: '-', resolved: true };
};

const BATCH_SIZE = 1000;

export const UberDataTab: React.FC = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [transactions, setTransactions] = useState<UberTransaction[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [lastImport, setLastImport] = useState<{ date: string; count: number } | null>(null);
  const [uberDriversMap, setUberDriversMap] = useState<Map<string, string>>(new Map());

  const loadRequestIdRef = useRef<number>(0);

  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIntegracao, setSelectedIntegracao] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const statusOptions = [
    { value: 'all', label: 'Todos os estados' },
    { value: 'settled', label: 'Liquidadas' },
    { value: 'pending', label: 'Pendentes' },
    { value: 'completed', label: 'Concluídas' },
  ];

  useEffect(() => {
    fetchIntegracoes();
    fetchLastImport();
    fetchUberDrivers();
  }, []);

  useEffect(() => {
    fetchAllTransactions();
  }, [startDate, endDate, selectedIntegracao]);

  const fetchLastImport = async () => {
    try {
      const { data } = await supabase
        .from('uber_sync_logs')
        .select('created_at, detalhes')
        .eq('tipo', 'csv_import')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data?.[0]) {
        const detalhes = data[0].detalhes as any;
        setLastImport({
          date: data[0].created_at || '',
          count: detalhes?.transactions_imported ?? detalhes?.total_imported ?? 0,
        });
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    return () => {
      loadRequestIdRef.current++;
    };
  }, []);

  const fetchUberDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('uber_drivers')
        .select('uber_driver_id, first_name, last_name');
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((d: any) => {
        const name = `${d.first_name || ''} ${d.last_name || ''}`.trim();
        if (name && d.uber_driver_id) map.set(d.uber_driver_id, name);
      });
      setUberDriversMap(map);
    } catch (e) {
      console.error('Erro ao carregar uber_drivers:', e);
    }
  };

  const fetchIntegracoes = async () => {
    try {
      const { data, error } = await supabase
        .from('plataformas_configuracao')
        .select('id, nome, ativo')
        .in('plataforma', ['uber', 'robot'])
        .order('nome');

      if (error) throw error;
      setIntegracoes((data || []) as Integracao[]);
    } catch (error: any) {
      console.error('Erro ao carregar integrações Uber:', error);
    }
  };

  const fetchTotalCount = async (): Promise<number> => {
    try {
      let q = supabase
        .from('uber_transactions')
        .select('*', { count: 'exact', head: true })
        .gte('occurred_at', `${format(startDate, 'yyyy-MM-dd')}T00:00:00`)
        .lte('occurred_at', `${format(endDate, 'yyyy-MM-dd')}T23:59:59`);

      if (selectedIntegracao !== 'all') {
        q = q.eq('integracao_id', selectedIntegracao);
      }

      const { count, error } = await q;
      if (!error && count !== null) {
        setTotalCount(count);
        return count;
      }
      return 0;
    } catch {
      return 0;
    }
  };

  const buildQuery = (rangeStart: number, rangeEnd: number) => {
    let query = supabase
      .from('uber_transactions')
      .select(
        `
        *,
        integracao:plataformas_configuracao!uber_transactions_integracao_id_fkey (nome)
      `
      )
      .gte('occurred_at', `${format(startDate, 'yyyy-MM-dd')}T00:00:00`)
      .lte('occurred_at', `${format(endDate, 'yyyy-MM-dd')}T23:59:59`)
      .order('occurred_at', { ascending: false })
      .range(rangeStart, rangeEnd);

    if (selectedIntegracao !== 'all') {
      query = query.eq('integracao_id', selectedIntegracao);
    }

    return query;
  };

  const fetchAllTransactions = useCallback(async () => {
    const currentRequestId = ++loadRequestIdRef.current;
    setLoading(true);
    setLoadingAll(true);
    setTransactions([]);

    try {
      const total = await fetchTotalCount();
      if (total === 0) {
        setLoading(false);
        setLoadingAll(false);
        return;
      }

      let offset = 0;
      let all: UberTransaction[] = [];

      while (true) {
        if (currentRequestId !== loadRequestIdRef.current) return;

        const { data, error } = await buildQuery(offset, offset + BATCH_SIZE - 1);
        if (error) throw error;

        const newData = (data || []) as UberTransaction[];
        if (newData.length === 0) break;

        all = [...all, ...newData];
        setTransactions(all);

        if (newData.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
        await new Promise((r) => setTimeout(r, 0));
      }

      if (currentRequestId === loadRequestIdRef.current) {
        setTransactions(all);
      }
    } catch (error: any) {
      if (currentRequestId === loadRequestIdRef.current) {
        console.error('Erro ao carregar transacções Uber:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar as transacções Uber.',
          variant: 'destructive',
        });
      }
    } finally {
      if (currentRequestId === loadRequestIdRef.current) {
        setLoading(false);
        setLoadingAll(false);
      }
    }
  }, [startDate, endDate, selectedIntegracao, toast]);

  const handleStopLoading = () => {
    loadRequestIdRef.current++;
    setLoadingAll(false);
    setLoading(false);
    toast({
      title: 'Carregamento interrompido',
      description: `${transactions.length} transacções carregadas.`,
    });
  };

  const driverNameMap = useMemo(() => {
    const map = new Map<string, string>();
    transactions.forEach((t) => {
      const name = extractDriverNameFromRaw(t.raw_transaction);
      if (name && t.uber_driver_id) {
        map.set(t.uber_driver_id, name);
      }
    });
    return map;
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'settled' && t.status !== 'settled') return false;
        if (selectedStatus === 'pending' && t.status !== 'pending') return false;
        if (selectedStatus === 'completed' && t.status !== 'completed') return false;
      }
      if (searchTerm) {
        const driverName = getDriverName(t, driverNameMap, uberDriversMap).name;
        const matches =
          matchesSearch(driverName, searchTerm) ||
          matchesSearch(t.trip_reference, searchTerm) ||
          matchesSearch(t.uber_driver_id, searchTerm) ||
          matchesSearch(t.uber_vehicle_id, searchTerm) ||
          matchesSearch(t.transaction_type, searchTerm);
        if (!matches) return false;
      }
      return true;
    });
  }, [transactions, searchTerm, selectedStatus, driverNameMap, uberDriversMap]);

  const stats = useMemo(() => {
    const total = filteredTransactions.length;
    const totalValor = filteredTransactions.reduce((sum, t) => sum + (t.gross_amount || 0), 0);
    const totalEarnings = filteredTransactions.reduce((sum, t) => sum + (t.net_amount || 0), 0);
    return { total, totalValor, totalEarnings };
  }, [filteredTransactions]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedIntegracao('all');
    setSelectedStatus('all');
    setStartDate(subDays(new Date(), 30));
    setEndDate(new Date());
  };

  const statusTranslations: Record<
    string,
    { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' }
  > = {
    settled: { label: 'Liquidada', variant: 'success' },
    completed: { label: 'Concluída', variant: 'success' },
    pending: { label: 'Pendente', variant: 'warning' },
    failed: { label: 'Falhada', variant: 'destructive' },
    cancelled: { label: 'Cancelada', variant: 'destructive' },
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="secondary">-</Badge>;

    const translation = statusTranslations[status];

    if (translation) {
      const variantClasses = {
        success: 'bg-green-500/20 text-green-400 border-green-500/30',
        destructive: 'bg-red-500/20 text-red-400 border-red-500/30',
        warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        secondary: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      };

      return <Badge className={variantClasses[translation.variant]}>{translation.label}</Badge>;
    }

    const formatted = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return <Badge variant="secondary">{formatted}</Badge>;
  };

  const hasActiveFilters =
    searchTerm ||
    selectedIntegracao !== 'all' ||
    selectedStatus !== 'all' ||
    format(startDate, 'yyyy-MM-dd') !== format(subDays(new Date(), 30), 'yyyy-MM-dd') ||
    format(endDate, 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd');

  const hasLocalFilters = searchTerm || selectedStatus !== 'all';

  return (
    <div className="space-y-4">
      {/* Date Range + Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[260px] justify-start text-left font-normal',
                  !startDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate && endDate ? (
                  <>
                    {format(startDate, 'dd/MM/yyyy')} → {format(endDate, 'dd/MM/yyyy')}
                  </>
                ) : (
                  <span>Selecionar período</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: startDate, to: endDate }}
                onSelect={(range: DateRange | undefined) => {
                  if (range?.from) setStartDate(range.from);
                  if (range?.to) setEndDate(range.to);
                  else if (range?.from) setEndDate(range.from);
                }}
                numberOfMonths={isMobile ? 1 : 2}
                initialFocus
                locale={pt}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <Select value={selectedIntegracao} onValueChange={setSelectedIntegracao}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Integração" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as integrações</SelectItem>
              {integracoes.map((int) => (
                <SelectItem key={int.id} value={int.id}>
                  {int.nome}
                  {!int.ativo && ' (inativa)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar referência, motorista, veículo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={handleClearFilters}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
          <span className="text-muted-foreground">
            Dados recebidos via webhook
            {lastImport && lastImport.date && (
              <>
                {' '}
                · Última importação CSV:{' '}
                {format(new Date(lastImport.date), 'dd/MM/yy HH:mm', { locale: pt })} (
                {lastImport.count} transacções)
              </>
            )}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Car className="h-4 w-4" />
              Viagens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Valor Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              €
              {stats.totalValor.toLocaleString('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Ganho Motorista (Líquido)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-400">
              €
              {stats.totalEarnings.toLocaleString('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Loading/Count status */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {loadingAll ? (
            <>
              <Loader2 className="h-4 w-4 inline-block mr-2 animate-spin" />A carregar{' '}
              {transactions.length} de {totalCount} transacções...
            </>
          ) : (
            <>
              A mostrar {transactions.length} transacções
              {hasLocalFilters && ` (${filteredTransactions.length} após filtros)`}
            </>
          )}
        </span>
        {loadingAll && (
          <Button variant="outline" size="sm" onClick={handleStopLoading}>
            <StopCircle className="h-4 w-4 mr-2" />
            Interromper
          </Button>
        )}
      </div>

      {totalCount > 10000 && !loading && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-4 w-4 inline-block mr-2" />
          Este período contém {totalCount.toLocaleString()} transacções. O carregamento pode ser
          lento em dispositivos móveis.
        </div>
      )}

      {/* Table */}
      {loading && transactions.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma transacção Uber encontrada.</p>
          <p className="text-sm">
            {integracoes.length === 0
              ? 'Configure uma integração Uber para começar.'
              : 'Os dados chegam automaticamente via webhook da Uber.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integração</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <Car className="h-3 w-3 text-blue-400" />
                      {t.integracao?.nome || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {(() => {
                      const periodo = (t.raw_transaction as Record<string, unknown>)?.periodo as
                        | string
                        | undefined;
                      if (periodo) {
                        const match = periodo.match(/(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/);
                        if (match) {
                          return `${match[3]}/${match[2]} → ${match[6]}/${match[5]}`;
                        }
                      }
                      if (t.trip_reference && !/^[0-9a-f]{8}-/.test(t.trip_reference)) {
                        return t.trip_reference.length > 16
                          ? `${t.trip_reference.slice(0, 16)}...`
                          : t.trip_reference;
                      }
                      return '—';
                    })()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const driver = getDriverName(t, driverNameMap, uberDriversMap);
                      if (driver.resolved) return driver.name;
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground italic cursor-help">
                                Sem nome (webhook)
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono text-xs">{driver.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {t.occurred_at
                      ? format(new Date(t.occurred_at), 'dd/MM/yy HH:mm', { locale: pt })
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.transaction_type || '-'}</Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium',
                      t.status === 'settled' && t.gross_amount && 'text-green-400'
                    )}
                  >
                    {t.gross_amount != null ? (
                      `€${t.gross_amount.toFixed(2)}`
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{getStatusBadge(t.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
