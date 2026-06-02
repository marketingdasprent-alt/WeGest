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
  Zap,
  Euro,
  X,
  Upload,
  CheckCircle2,
  Star,
  Clock,
  Car,
  CalendarIcon,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn, matchesSearch } from '@/lib/utils';
import { ImportRobotCsvDialog } from '@/components/admin/ImportRobotCsvDialog';
import { DateRange } from 'react-day-picker';

interface Integracao {
  id: string;
  nome: string;
  ativo: boolean;
  plataforma: string;
  robot_target_platform: string | null;
}

interface BoltResumo {
  id: string;
  motorista_nome: string | null;
  email: string | null;
  telefone: string | null;
  periodo: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  viagens_terminadas: number | null;
  ganhos_brutos_total: number | null;
  ganhos_liquidos: number | null;
  comissoes: number | null;
  classificacao_media: number | null;
  tempo_online_min: number | null;
  taxa_aceitacao: number | null;
  portagens: number | null;
  gorjetas: number | null;
  taxas_cancelamento: number | null;
  integracao_id: string;
  integracao?: { nome: string };
}

export const BoltDataTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resumos, setResumos] = useState<BoltResumo[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [lastImport, setLastImport] = useState<{ date: string; count: number } | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIntegracao, setSelectedIntegracao] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [rangeClickCount, setRangeClickCount] = useState(0);

  useEffect(() => {
    fetchIntegracoes();
    fetchLastImport();
  }, []);

  useEffect(() => {
    fetchResumos();
  }, [selectedIntegracao, dateRange]);

  const fetchIntegracoes = async () => {
    try {
      const { data, error } = await supabase
        .from('plataformas_configuracao')
        .select('id, nome, ativo, plataforma, robot_target_platform')
        .or('plataforma.eq.bolt,and(plataforma.eq.robot,robot_target_platform.eq.bolt)')
        .order('nome');
      if (error) throw error;
      setIntegracoes((data || []) as Integracao[]);
    } catch (error) {
      console.error('Erro ao carregar integrações:', error);
    }
  };

  const fetchLastImport = async () => {
    try {
      const { data } = await supabase
        .from('bolt_sync_logs')
        .select('created_at, viagens_novas')
        .in('tipo', ['csv_import', 'robot_import', 'full_sync'])
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data?.[0]) {
        setLastImport({
          date: data[0].created_at || '',
          count: data[0].viagens_novas ?? 0,
        });
      }
    } catch {
      /* silent */
    }
  };

  const formatDateForQuery = (d: Date) => format(d, 'yyyy-MM-dd');

  const fetchResumos = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bolt_resumos_semanais')
        .select(
          `
          *,
          integracao:plataformas_configuracao!bolt_resumos_semanais_integracao_id_fkey (nome)
        `
        )
        .order('motorista_nome');

      const fromDate = dateRange?.from;
      const toDate = dateRange?.to || dateRange?.from;
      if (fromDate) {
        // Show records whose week overlaps with the selected range
        query = query.lte('periodo_inicio', formatDateForQuery(toDate!));
      }
      if (toDate) {
        query = query.gte('periodo_fim', formatDateForQuery(fromDate!));
      }
      if (selectedIntegracao !== 'all') {
        query = query.eq('integracao_id', selectedIntegracao);
      }

      const { data, error } = await query;
      if (error) throw error;
      setResumos((data || []) as BoltResumo[]);
    } catch (error: any) {
      console.error('Erro ao carregar resumos:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os resumos Bolt.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImportComplete = () => {
    fetchResumos();
    fetchLastImport();
  };

  // Apply local search filter
  const filteredResumos = useMemo(() => {
    if (!searchTerm) return resumos;
    return resumos.filter(
      (r) =>
        matchesSearch(r.motorista_nome, searchTerm) ||
        matchesSearch(r.email, searchTerm) ||
        matchesSearch(r.telefone, searchTerm)
    );
  }, [resumos, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredResumos.length;
    const totalViagens = filteredResumos.reduce((sum, r) => sum + (r.viagens_terminadas || 0), 0);
    const totalBruto = filteredResumos.reduce((sum, r) => sum + (r.ganhos_brutos_total || 0), 0);
    const totalLiquido = filteredResumos.reduce((sum, r) => sum + (r.ganhos_liquidos || 0), 0);
    return { total, totalViagens, totalBruto, totalLiquido };
  }, [filteredResumos]);

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    if (rangeClickCount === 0) {
      // First click: start fresh with just this date
      setDateRange({ from: range?.from, to: undefined });
      setRangeClickCount(1);
    } else {
      // Second click: complete the range
      setDateRange(range);
      setRangeClickCount(0);
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedIntegracao('all');
    setDateRange({ from: subDays(new Date(), 30), to: new Date() });
    setRangeClickCount(0);
  };

  const hasActiveFilters =
    searchTerm || selectedIntegracao !== 'all' || !dateRange?.from || !dateRange?.to;

  const firstActiveIntegracao = integracoes.find((i) => i.ativo);

  const formatMinutes = (min: number | null) => {
    if (!min) return '-';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
  };

  const dateLabel =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, 'dd/MM/yyyy', { locale: pt })} - ${format(dateRange.to, 'dd/MM/yyyy', { locale: pt })}`
      : dateRange?.from
        ? format(dateRange.from, 'dd/MM/yyyy', { locale: pt })
        : 'Selecionar datas';

  const handleFetchFromApify = async () => {
    setLoading(true);
    try {
      // 1. Get ALL active integrations with Apify tokens
      const { data: configs, error: configError } = await supabase
        .from('plataformas_configuracao')
        .select('id, nome, apify_api_token, apify_actor_id, plataforma, robot_target_platform')
        .eq('ativo', true)
        .not('apify_api_token', 'is', null);

      if (configError) throw configError;

      // STRICT Filtering for Bolt-related integrations
      const boltConfigs = configs?.filter(
        (c) =>
          c.plataforma === 'bolt' ||
          c.robot_target_platform === 'bolt' ||
          c.nome.toLowerCase().includes('bolt')
      );

      if (!boltConfigs || boltConfigs.length === 0) {
        toast({
          title: 'Configuração não encontrada',
          description: 'Certifique-se de que a integração Bolt-Robot está ativa.',
          variant: 'destructive',
        });
        return;
      }

      // Removed cleanup: orphan records must be preserved for manual association
      console.log('Fetching Bolt records from Apify...');

      toast({
        title: 'Resgatando do Apify',
        description: `Processando ${boltConfigs.length} integração(ões) Bolt...`,
      });

      let totalImported = 0;
      for (const config of boltConfigs) {
        console.log(`Rescuing Bolt integration: ${config.nome}`);

        const { data, error } = await supabase.functions.invoke('bolt-rescue-apify', {
          body: { integracao_id: config.id },
        });

        if (!error && data?.success) {
          totalImported += data.imported || 0;
        } else {
          console.error(`Error rescuing ${config.nome}:`, error || data?.error);
        }
      }

      toast({
        title: 'Resgate Bolt concluído!',
        description: `Importados ${totalImported} registos das sincronizações do Apify.`,
      });
      fetchResumos();
      fetchLastImport();
    } catch (error: any) {
      console.error('Erro no resgate Bolt:', error);
      toast({
        title: 'Erro no Resgate',
        description: error.message || 'Falha técnica ao tentar resgatar dados.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[280px] justify-start text-left font-normal',
                  !dateRange?.from && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeSelect}
                numberOfMonths={2}
                className={cn('p-3 pointer-events-auto')}
                locale={pt}
              />
            </PopoverContent>
          </Popover>

          {/* Integration Filter */}
          <Select value={selectedIntegracao} onValueChange={setSelectedIntegracao}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todas as integrações" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as integrações</SelectItem>
              {integracoes.map((int) => (
                <SelectItem key={int.id} value={int.id}>
                  {int.nome}
                  {int.plataforma === 'robot' && ' (Robot)'}
                  {!int.ativo && ' (inativa)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar motorista..."
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

        {/* Import Status Bar */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {lastImport ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">
                  Última importação:{' '}
                  {format(new Date(lastImport.date), 'dd/MM/yyyy HH:mm', { locale: pt })} (
                  {lastImport.count} registos)
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {integracoes.filter((i) => i.ativo).length === 0
                  ? 'Nenhuma integração activa'
                  : 'Dados recebidos via importação automática ou manual'}
              </span>
            )}
          </div>
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
            <p className="text-2xl font-bold">{stats.totalViagens.toLocaleString()}</p>
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
              <p className="text-2xl font-bold">
                €
                {stats.totalBruto.toLocaleString('pt-PT', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
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
              <p className="text-2xl font-bold text-green-400">
                €
                {stats.totalLiquido.toLocaleString('pt-PT', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {loading ? (
          <span>
            <Loader2 className="h-4 w-4 inline-block mr-2 animate-spin" />A carregar...
          </span>
        ) : (
          <span>
            {stats.total} motorista{stats.total !== 1 ? 's' : ''}
            {searchTerm && ` (filtrado de ${resumos.length})`}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredResumos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum resumo Bolt encontrado.</p>
          <p className="text-sm">
            {integracoes.length === 0
              ? 'Configure uma integração Bolt para começar.'
              : 'Ajuste os filtros ou importe dados.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integração</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Viagens</TableHead>
                <TableHead className="text-right">Tempo Online</TableHead>
                <TableHead className="text-right">Ganhos Brutos</TableHead>
                <TableHead className="text-right">Comissões</TableHead>
                <TableHead className="text-right">Ganhos Líquidos</TableHead>
                <TableHead className="text-center">Classificação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResumos.map((resumo) => (
                <TableRow key={resumo.id}>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <Zap className="h-3 w-3 text-green-400" />
                      {resumo.integracao?.nome || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{resumo.motorista_nome || '-'}</p>
                      {resumo.email && (
                        <p className="text-xs text-muted-foreground">{resumo.email}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {resumo.periodo_inicio && resumo.periodo_fim
                      ? `${format(new Date(resumo.periodo_inicio), 'dd/MM', { locale: pt })} - ${format(new Date(resumo.periodo_fim), 'dd/MM/yyyy', { locale: pt })}`
                      : resumo.periodo}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {resumo.viagens_terminadas ?? '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className="flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {formatMinutes(resumo.tempo_online_min)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {resumo.ganhos_brutos_total != null
                      ? `€${Number(resumo.ganhos_brutos_total).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right text-destructive font-medium">
                    {resumo.comissoes != null
                      ? `€${Number(resumo.comissoes).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right text-green-400 font-medium">
                    {resumo.ganhos_liquidos != null
                      ? `€${Number(resumo.ganhos_liquidos).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {resumo.classificacao_media ? (
                      <span className="flex items-center justify-center gap-1">
                        <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                        {Number(resumo.classificacao_media).toFixed(1)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
