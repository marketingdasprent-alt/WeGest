import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import {
  Loader2,
  Send,
  CheckCircle,
  Eye,
  MousePointerClick,
  AlertTriangle,
  ShieldAlert,
  Ban,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';

export const EstatisticasTab = () => {
  const [campanhaId, setCampanhaId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<string>('last_event_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  // Fetch campanhas enviadas
  const { data: campanhas } = useQuery({
    queryKey: ['campanhas-enviadas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_campanhas')
        .select(
          'id, nome, assunto, enviado_em, total_enviados, total_entregues, total_abertos, total_clicados, total_bounces'
        )
        .in('status', ['enviado', 'enviando'])
        .order('enviado_em', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (campanhas?.length && !campanhaId) {
      setCampanhaId(campanhas[0].id);
    }
  }, [campanhas, campanhaId]);

  // Fetch email_sends from local DB
  const {
    data: emailSends,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['email-sends', campanhaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_sends')
        .select('*')
        .eq('campanha_id', campanhaId)
        .order('last_event_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!campanhaId,
    refetchInterval: 10000, // Auto-refresh every 10s
  });

  // Calculate KPIs from local data
  const totais = emailSends
    ? {
        total: emailSends.length,
        delivered: emailSends.filter((e) => ['delivered', 'opened', 'clicked'].includes(e.status))
          .length,
        opened: emailSends.filter((e) => ['opened', 'clicked'].includes(e.status)).length,
        clicked: emailSends.filter((e) => e.status === 'clicked').length,
        bounced: emailSends.filter((e) => e.status === 'bounced').length,
        spam: emailSends.filter((e) => e.status === 'spam').length,
        blocked: emailSends.filter((e) => ['blocked', 'invalid'].includes(e.status)).length,
        unsubscribed: emailSends.filter((e) => e.status === 'unsubscribed').length,
      }
    : null;

  const sortedEmailSends = useMemo(() => {
    if (!emailSends) return [];
    const list = [...emailSends];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'email') {
        va = a.email || '';
        vb = b.email || '';
      } else if (sortField === 'status') {
        va = a.status || '';
        vb = b.status || '';
      } else if (sortField === 'last_event') {
        va = a.last_event || '';
        vb = b.last_event || '';
      } else if (sortField === 'last_event_at') {
        va = a.last_event_at || '';
        vb = b.last_event_at || '';
      } else if (sortField === 'error_message') {
        va = a.error_message || '';
        vb = b.error_message || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [emailSends, sortField, sortDir]);

  const campanhaSelecionada = campanhas?.find((c) => c.id === campanhaId);
  const totalEnviados = campanhaSelecionada?.total_enviados || totais?.total || 0;

  const taxa = (valor: number) => {
    if (!totalEnviados) return '0%';
    return ((valor / totalEnviados) * 100).toFixed(1) + '%';
  };

  // Manual sync
  const handleSync = async () => {
    if (!campanhaId) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-campaign-sends', {
        body: { campanha_id: campanhaId },
      });
      if (error) throw error;
      setLastSync(new Date());
      toast.success(
        `Sincronizado: ${data?.total_events || 0} eventos, ${data?.upserted || 0} registos`
      );
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao sincronizar: ' + message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync on campaign change
  useEffect(() => {
    if (campanhaId) {
      handleSync();
    }
  }, [campanhaId]);

  const kpis = totais
    ? [
        { label: 'Enviados', valor: totais.total, icon: Send, cor: 'text-blue-500' },
        {
          label: 'Entregues',
          valor: totais.delivered,
          icon: CheckCircle,
          cor: 'text-green-500',
          taxa: taxa(totais.delivered),
        },
        {
          label: 'Abertos',
          valor: totais.opened,
          icon: Eye,
          cor: 'text-purple-500',
          taxa: taxa(totais.opened),
        },
        {
          label: 'Clicados',
          valor: totais.clicked,
          icon: MousePointerClick,
          cor: 'text-orange-500',
          taxa: taxa(totais.clicked),
        },
        { label: 'Bounces', valor: totais.bounced, icon: AlertTriangle, cor: 'text-yellow-500' },
        { label: 'Spam', valor: totais.spam, icon: ShieldAlert, cor: 'text-red-500' },
        { label: 'Bloqueados', valor: totais.blocked, icon: Ban, cor: 'text-muted-foreground' },
      ]
    : [];

  const statusBadge = (status: string) => {
    const map: Record<
      string,
      { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
    > = {
      sent: { label: 'Enviado', variant: 'outline' },
      delivered: { label: 'Entregue', variant: 'default' },
      opened: { label: 'Aberto', variant: 'secondary' },
      clicked: { label: 'Clicado', variant: 'secondary' },
      bounced: { label: 'Bounce', variant: 'destructive' },
      spam: { label: 'Spam', variant: 'destructive' },
      unsubscribed: { label: 'Dessubscrito', variant: 'destructive' },
      blocked: { label: 'Bloqueado', variant: 'destructive' },
      invalid: { label: 'Inválido', variant: 'destructive' },
      deferred: { label: 'Adiado', variant: 'outline' },
    };
    const info = map[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Campanha</label>
          <Select value={campanhaId} onValueChange={setCampanhaId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar campanha..." />
            </SelectTrigger>
            <SelectContent>
              {campanhas?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}{' '}
                  {c.enviado_em
                    ? `(${format(new Date(c.enviado_em), 'dd/MM/yyyy', { locale: pt })})`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" onClick={handleSync} disabled={isSyncing || !campanhaId}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
        </div>
      </div>

      {lastSync && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Última sincronização: {format(lastSync, 'dd/MM/yyyy HH:mm:ss', { locale: pt })}
          <span className="ml-2">• Auto-refresh a cada 10s</span>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {totais && !isLoading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {kpis.map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-4 text-center">
                  <kpi.icon className={`h-5 w-5 mx-auto mb-1 ${kpi.cor}`} />
                  <p className="text-2xl font-bold">{kpi.valor}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  {kpi.taxa && <p className="text-xs font-medium mt-1">{kpi.taxa}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Detalhes por Destinatário ({emailSends?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!emailSends?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sem dados disponíveis. Clique em "Sincronizar" para buscar dados da Brevo.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        field="email"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Email
                      </SortableTableHead>
                      <SortableTableHead
                        field="status"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Estado
                      </SortableTableHead>
                      <SortableTableHead
                        field="last_event"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Último Evento
                      </SortableTableHead>
                      <SortableTableHead
                        field="last_event_at"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Data
                      </SortableTableHead>
                      <SortableTableHead
                        field="error_message"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Detalhe
                      </SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEmailSends.map((send) => (
                      <TableRow key={send.id}>
                        <TableCell className="text-sm">{send.email}</TableCell>
                        <TableCell>{statusBadge(send.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {send.last_event || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {send.last_event_at
                            ? format(new Date(send.last_event_at), 'dd/MM/yyyy HH:mm', {
                                locale: pt,
                              })
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {send.error_message || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!campanhaId && !isLoading && (
        <p className="text-center text-muted-foreground py-12">
          Selecione uma campanha para ver as estatísticas.
        </p>
      )}
    </div>
  );
};
