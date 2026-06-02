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
  Zap,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn, matchesSearch } from '@/lib/utils';
import { ImportRobotCsvDialog } from '@/components/admin/ImportRobotCsvDialog';
import { DateRange } from 'react-day-picker';

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  useEffect(() => {
    fetchIntegracoes();
  }, []);
  useEffect(() => {
    fetchTransacoes();
  }, [selectedIntegracao, dateRange]);

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

      if (dateRange?.from) query = query.gte('transaction_date', dateRange.from.toISOString());
      if (dateRange?.to) query = query.lte('transaction_date', dateRange.to.toISOString());
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[280px] justify-start text-left">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from
                ? dateRange.to
                  ? `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
                  : format(dateRange.from, 'dd/MM/yyyy')
                : 'Selecionar período'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
              locale={pt}
            />
          </PopoverContent>
        </Popover>
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
              {filtered.map((t) => (
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
