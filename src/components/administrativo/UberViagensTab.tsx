import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Users, Clock, Route, Activity } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface AtividadeMotorista {
  id: string;
  integracao_id: string;
  uber_driver_id: string;
  driver_name: string | null;
  viagens_concluidas: number | null;
  tempo_online_minutos: number | null;
  tempo_em_viagem_minutos: number | null;
  periodo: string | null;
  created_at: string | null;
}

interface Props {
  uberDriversMap: Map<string, string>;
}

const formatMinutes = (mins: number | null): string => {
  if (mins == null || mins === 0) return '-';
  const days = Math.floor(mins / (24 * 60));
  const hours = Math.floor((mins % (24 * 60)) / 60);
  const minutes = Math.round(mins % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
};

const formatPeriodo = (periodo: string | null): string => {
  if (!periodo) return '-';
  const match = periodo.match(/^(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]} → ${match[6]}/${match[5]}/${match[4]}`;
  }
  return periodo;
};

export const UberViagensTab: React.FC<Props> = ({ uberDriversMap }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [atividade, setAtividade] = useState<AtividadeMotorista[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const fetchAtividade = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('uber_atividade_motoristas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) throw error;
      setAtividade((data || []) as AtividadeMotorista[]);
    } catch (error: any) {
      console.error('Erro ao carregar atividade:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar a atividade.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAtividade();
  }, [fetchAtividade]);

  const getDriverDisplayName = (a: AtividadeMotorista): string => {
    if (a.driver_name) return a.driver_name;
    if (a.uber_driver_id && uberDriversMap.has(a.uber_driver_id)) {
      return uberDriversMap.get(a.uber_driver_id)!;
    }
    return `${a.uber_driver_id.slice(0, 10)}...`;
  };

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const list = searchTerm
      ? atividade.filter((a) => {
          const name = getDriverDisplayName(a).toLowerCase();
          return name.includes(term) || (a.periodo || '').includes(term);
        })
      : [...atividade];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortField) {
        case 'motorista':
          va = getDriverDisplayName(a);
          vb = getDriverDisplayName(b);
          break;
        case 'viagens_concluidas':
          va = a.viagens_concluidas || 0;
          vb = b.viagens_concluidas || 0;
          break;
        case 'tempo_online_minutos':
          va = a.tempo_online_minutos || 0;
          vb = b.tempo_online_minutos || 0;
          break;
        case 'tempo_em_viagem_minutos':
          va = a.tempo_em_viagem_minutos || 0;
          vb = b.tempo_em_viagem_minutos || 0;
          break;
        case 'periodo':
          va = a.periodo || '';
          vb = b.periodo || '';
          break;
        case 'created_at':
          va = a.created_at || '';
          vb = b.created_at || '';
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [atividade, searchTerm, uberDriversMap, sortField, sortDir]);

  const stats = useMemo(
    () => ({
      totalMotoristas: new Set(filtered.map((a) => a.uber_driver_id)).size,
      totalViagens: filtered.reduce((s, a) => s + (a.viagens_concluidas || 0), 0),
      totalOnline: filtered.reduce((s, a) => s + (a.tempo_online_minutos || 0), 0),
      totalEmViagem: filtered.reduce((s, a) => s + (a.tempo_em_viagem_minutos || 0), 0),
    }),
    [filtered]
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar motorista..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Motoristas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalMotoristas}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Route className="h-4 w-4" />
              Total Viagens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalViagens}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Tempo Online
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMinutes(stats.totalOnline)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Tempo em Viagem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMinutes(stats.totalEmViagem)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum registo de atividade encontrado.</p>
          <p className="text-sm">Os dados chegam via importação CSV do Apify.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  field="motorista"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Motorista
                </SortableTableHead>
                <SortableTableHead
                  field="viagens_concluidas"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="text-center"
                >
                  Viagens
                </SortableTableHead>
                <SortableTableHead
                  field="tempo_online_minutos"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="text-center"
                >
                  Tempo Online
                </SortableTableHead>
                <SortableTableHead
                  field="tempo_em_viagem_minutos"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="text-center"
                >
                  Tempo em Viagem
                </SortableTableHead>
                <SortableTableHead
                  field="periodo"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Período
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm font-medium">{getDriverDisplayName(a)}</TableCell>
                  <TableCell className="text-center font-medium">
                    {a.viagens_concluidas ?? '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {formatMinutes(a.tempo_online_minutos)}
                  </TableCell>
                  <TableCell className="text-center">
                    {formatMinutes(a.tempo_em_viagem_minutos)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatPeriodo(a.periodo)}
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
