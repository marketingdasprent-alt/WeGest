// Calendario module
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { CalendarioGrid } from '@/components/calendario/CalendarioGrid';
import { EventoDialog } from '@/components/calendario/EventoDialog';
import { EventoHistoricoDialog } from '@/components/calendario/EventoHistoricoDialog';
import { CalendarioConfig } from '@/components/calendario/CalendarioConfig';
import { RelatorioDialog } from '@/components/calendario/RelatorioDialog';
import { RecolhasPendentesDrawer } from '@/components/calendario/RecolhasPendentesDrawer';
import { CheckOutPendentesDrawer } from '@/components/calendario/CheckOutPendentesDrawer';
import { ListaEsperaDrawer } from '@/components/calendario/ListaEsperaDrawer';
import { useEventosPendentesRenting } from '@/hooks/useEventosPendentesRenting';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRightLeft,
  CalendarDays,
  Clock,
  FileDown,
  Info,
  LogOut,
  PackageCheck,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { format } from 'date-fns';
import { EVENTO_COLS } from '@/components/calendario/eventoColumns';

export interface CalendarioEvento {
  id: string;
  titulo: string;
  descricao: string | null;
  cidade: string | null;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  dia_todo: boolean;
  matricula_devolver: string | null;
  criado_por: string;
  realizado_por_id: string | null;
  realizado_em: string | null;
  created_at: string;
  updated_at: string;
  profiles: { nome: string } | null;
  /** Nome de quem realizou (lookup em profiles via realizado_por_id). */
  realizador?: { nome: string } | null;
  /** Entidade que gerou o evento: contrato_renting | movimento | contrato | manual. */
  origem_tipo?: string | null;
}

const Calendario: React.FC = () => {
  const { user } = useAuth();
  const { hasPermission, isAdmin, cargo } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [configOpen, setConfigOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [recolhasPendentesOpen, setRecolhasPendentesOpen] = useState(false);
  const [checkoutPendentesOpen, setCheckoutPendentesOpen] = useState(false);
  const [listaEsperaOpen, setListaEsperaOpen] = useState(false);
  const [editingEvento, setEditingEvento] = useState<CalendarioEvento | null>(null);
  const [detailsEvento, setDetailsEvento] = useState<CalendarioEvento | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // Deep-link: evento de recolha/devolução legacy clicado no calendário —
  // pré-seleciona no RecolhasPendentesDrawer ao abrir.
  const [checkinDeepLinkEventoId, setCheckinDeepLinkEventoId] = useState<string | null>(null);

  // Realtime subscription - actualiza automaticamente quando qualquer gestor cria/edita/elimina eventos
  useEffect(() => {
    const channel = supabase
      .channel('calendario-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_eventos' }, () => {
        queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
        queryClient.invalidateQueries({ queryKey: ['lista-espera-count'] });
        queryClient.invalidateQueries({ queryKey: ['checkout-pendentes-count'] });
        queryClient.invalidateQueries({ queryKey: ['checkin-pendentes-count'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Badge check-in: lê de eventos (realizado_em IS NULL) — unifica recolha/devolucao/troca.
  const { data: recolhasPendentesCount = 0 } = useQuery({
    queryKey: ['checkin-pendentes-count'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { count, error } = await (
        supabase.from('calendario_eventos').select('id', { count: 'exact', head: true }) as any
      )
        .in('tipo', ['recolha', 'devolucao', 'troca'])
        .eq(EVENTO_COLS.origemTipo, 'contrato')
        .is(EVENTO_COLS.realizadoEm, null)
        .lte('data_inicio', now);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  // Contagem combinada (legacy + renting) para os badges nos botões. Reaproveita
  // o mesmo hook usado pelas listas (RentingPendentesSection) — mesma query,
  // mesmo filtro (exclui contratos de teste), sem duplicar lógica nem arriscar
  // o badge dessincronizar da lista real.
  const { data: rentingEntregaPendentes = [] } = useEventosPendentesRenting({ tipo: 'entrega' });
  const { data: rentingRecolhaPendentes = [] } = useEventosPendentesRenting({ tipo: 'recolha' });
  const rentingEntregaPendentesCount = rentingEntregaPendentes.length;
  const rentingRecolhaPendentesCount = rentingRecolhaPendentes.length;

  const canManageListaEspera = isAdmin || !!cargo?.toLowerCase().includes('supervisor');

  const { data: listaEsperaCount = 0 } = useQuery({
    queryKey: ['lista-espera-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('calendario_eventos')
        .select('id', { count: 'exact', head: true })
        .eq('tipo', 'lista_espera');
      if (error) throw error;
      return count || 0;
    },
  });

  // Badge check-out: two-step para evitar falsos positivos de eventos históricos
  // (realizado_em IS NULL mas contrato já encerrado antes da Fase 4).
  const { data: checkoutPendentesCount = 0 } = useQuery({
    queryKey: ['checkout-pendentes-count'],
    queryFn: async () => {
      const { data: evs, error: evErr } = await supabase
        .from('calendario_eventos')
        .select('origem_id')
        .eq('tipo', 'entrega')
        .eq(EVENTO_COLS.origemTipo, 'contrato')
        .is(EVENTO_COLS.realizadoEm, null);
      if (evErr) throw evErr;
      const ids = (evs ?? []).map((e) => e.origem_id).filter((x): x is string => !!x);
      if (ids.length === 0) return 0;
      const { count, error: ctErr } = await supabase
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .in('id', ids)
        .eq('status', 'ativo');
      if (ctErr) throw ctErr;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['calendario-eventos', currentMonth.getFullYear(), currentMonth.getMonth()],
    queryFn: async () => {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0,
        23,
        59,
        59
      );

      // Extend range to cover visible days from adjacent months
      startOfMonth.setDate(startOfMonth.getDate() - 7);
      endOfMonth.setDate(endOfMonth.getDate() + 7);

      const { data, error } = await supabase
        .from('calendario_eventos')
        .select('*')
        .gte('data_inicio', startOfMonth.toISOString())
        .lte('data_inicio', endOfMonth.toISOString())
        .order('data_inicio', { ascending: true });

      if (error) throw error;

      // Buscar nomes dos criadores E dos realizadores em separado
      const criadorIds = (data || []).map((e) => e.criado_por);
      const realizadorIds = (data || [])
        .map((e) => e.realizado_por_id)
        .filter((id): id is string => !!id);
      const allIds = [...new Set([...criadorIds, ...realizadorIds])];

      let profilesMap: Record<string, string> = {};
      if (allIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', allIds);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map((p) => [p.id, p.nome || '']));
        }
      }

      return (data || []).map((e) => ({
        ...e,
        profiles: profilesMap[e.criado_por] ? { nome: profilesMap[e.criado_por] } : null,
        realizador:
          e.realizado_por_id && profilesMap[e.realizado_por_id]
            ? { nome: profilesMap[e.realizado_por_id] }
            : null,
      })) as CalendarioEvento[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Fetch event type + motorista_id before deleting
      const { data: evento } = await supabase
        .from('calendario_eventos')
        .select('tipo, motorista_id')
        .eq('id', id)
        .single();

      if (evento?.tipo === 'entrega') {
        const today = format(new Date(), 'yyyy-MM-dd');

        // Try to find a contrato linked to this event
        const { data: contrato } = await supabase
          .from('contratos')
          .select('id, motorista_id, viatura_id, status')
          .eq('calendario_evento_id', id)
          .maybeSingle();

        if (contrato) {
          if (contrato.viatura_id) {
            await supabase
              .from('motorista_viaturas')
              .update({ status: 'encerrado', data_fim: today })
              .eq('motorista_id', contrato.motorista_id)
              .eq('viatura_id', contrato.viatura_id)
              .eq('status', 'ativo');

            await supabase
              .from('viaturas')
              .update({ status: 'disponivel' })
              .eq('id', contrato.viatura_id);
          }

          if (contrato.status === 'ativo') {
            await supabase.from('contratos').update({ status: 'encerrado' }).eq('id', contrato.id);
          }
        } else if (evento.motorista_id) {
          // Orphan case: old flow created motorista_viaturas without a contrato
          const { data: mv } = await supabase
            .from('motorista_viaturas')
            .select('id, viatura_id')
            .eq('motorista_id', evento.motorista_id)
            .eq('status', 'ativo')
            .order('data_inicio', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (mv) {
            await supabase
              .from('motorista_viaturas')
              .update({ status: 'encerrado', data_fim: today })
              .eq('id', mv.id);

            await supabase
              .from('viaturas')
              .update({ status: 'disponivel' })
              .eq('id', mv.viatura_id);
          }
        }
      }

      const { error } = await supabase.from('calendario_eventos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-calendario'] });
      queryClient.invalidateQueries({ queryKey: ['motorista-viaturas'] });
      toast.success('Evento eliminado');
    },
    onError: () => toast.error('Erro ao eliminar evento'),
  });

  const handleEdit = (evento: CalendarioEvento) => {
    setEditingEvento(evento);
  };

  const handleDetails = (evento: CalendarioEvento) => {
    setDetailsEvento(evento);
    setHistoricoOpen(true);
  };

  // Deep-link a partir do card do evento: recolha/devolução/troca legacy
  // (origem_tipo='contrato') abre directo no passo de check-in.
  const handleAbrirCheckin = (evento: CalendarioEvento) => {
    setCheckinDeepLinkEventoId(evento.id);
    setRecolhasPendentesOpen(true);
  };

  return (
    <>
      <ListaEsperaDrawer
        open={listaEsperaOpen}
        onOpenChange={setListaEsperaOpen}
        canManage={canManageListaEspera}
      />
      <RecolhasPendentesDrawer
        open={recolhasPendentesOpen}
        onOpenChange={(v) => {
          setRecolhasPendentesOpen(v);
          if (!v) setCheckinDeepLinkEventoId(null);
        }}
        userId={user?.id || ''}
        initialEventoId={checkinDeepLinkEventoId}
      />
      <CheckOutPendentesDrawer
        open={checkoutPendentesOpen}
        onOpenChange={setCheckoutPendentesOpen}
        userId={user?.id || ''}
      />
      {editingEvento && (
        <EventoDialog
          evento={editingEvento}
          userId={user?.id || ''}
          onClose={() => setEditingEvento(null)}
        />
      )}
      <div className="flex flex-col h-[calc(100dvh-6rem)] md:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)]">
        <StickyPageHeader
          title="Movimentações"
          description="Agendamento de entregas, devoluções e transferências"
          icon={CalendarDays}
        >
          <div className="flex items-center gap-2">
            {hasPermission('calendario_exportar') && (
              <Button variant="outline" size="icon" onClick={() => setRelatorioOpen(true)}>
                <FileDown className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => setConfigOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            {hasPermission('calendario_recolhas') && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setCheckoutPendentesOpen(true)}
                  className="relative gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Entrega</span>
                  {checkoutPendentesCount + rentingEntregaPendentesCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] bg-green-600 text-white border-0">
                      {checkoutPendentesCount + rentingEntregaPendentesCount}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setRecolhasPendentesOpen(true)}
                  className="relative gap-2"
                >
                  <PackageCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Recolha/Devolução</span>
                  {recolhasPendentesCount + rentingRecolhaPendentesCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] bg-orange-500 text-white border-0">
                      {recolhasPendentesCount + rentingRecolhaPendentesCount}
                    </Badge>
                  )}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => setListaEsperaOpen(true)}
              className="relative gap-2"
            >
              <Clock className="h-4 w-4 text-pink-500" />
              <span className="hidden sm:inline">Lista de Espera</span>
              {listaEsperaCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] bg-pink-500 text-white border-0">
                  {listaEsperaCount}
                </Badge>
              )}
            </Button>
            {hasPermission('renting_movimentacoes') && (
              <Button
                variant="outline"
                onClick={() => navigate('/renting/movimentacoes')}
                className="gap-2"
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Movimentação Interna</span>
              </Button>
            )}
          </div>
        </StickyPageHeader>

        <div className="shrink-0 mt-2 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground shadow-sm">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="leading-relaxed">
            <strong className="font-semibold text-primary">Os eventos são automáticos.</strong>{' '}
            Entregas, recolhas, trocas e upgrades vêm dos{' '}
            <strong className="font-semibold">contratos</strong> (ao criar ou versionar); as
            transferências internas vêm das <strong className="font-semibold">movimentações</strong>
            . Aqui só consultas e fazes check-in / check-out.
          </p>
        </div>

        <div className="flex-1 min-h-0">
          <CalendarioGrid
            eventos={eventos}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            onEventClick={
              isAdmin
                ? (ev) => {
                    if (ev.tipo === 'lista_espera' && !canManageListaEspera) return;
                    handleEdit(ev);
                  }
                : undefined
            }
            onDeleteEvent={isAdmin ? (id) => deleteMutation.mutate(id) : undefined}
            onEventDetails={handleDetails}
            onAbrirCheckin={handleAbrirCheckin}
            isLoading={isLoading}
            currentUserId={user?.id}
            canEditAll={hasPermission('calendario_gerir_todos')}
          />
        </div>

        <EventoHistoricoDialog
          open={historicoOpen}
          onOpenChange={setHistoricoOpen}
          evento={detailsEvento}
        />

        <CalendarioConfig open={configOpen} onOpenChange={setConfigOpen} userId={user?.id || ''} />

        <RelatorioDialog
          open={relatorioOpen}
          onOpenChange={setRelatorioOpen}
          currentMonth={currentMonth}
        />
      </div>
    </>
  );
};

export default Calendario;
