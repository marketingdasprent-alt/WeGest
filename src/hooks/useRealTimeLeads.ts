import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  zona?: string;
  data_aluguer?: string;
  tipo_viatura?: string;
  observacoes?: string;
  observacoes_gestores?: string;
  campaign_tags?: string[];
  status: string;
  created_at: string;
  formulario_id?: string;
  gestor_responsavel?: string;
  valor_negocio?: string;
}

interface DateFilter {
  from?: Date;
  to?: Date;
}

const DEFAULT_DAYS = 30;
const MAX_LEADS = 300;

function defaultFrom(): Date {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_DAYS);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const useRealTimeLeads = (
  onRealtimeEvent?: (payload: any) => void,
  dateFilter?: DateFilter
) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);

  const onRealtimeEventRef = useRef(onRealtimeEvent);
  useEffect(() => {
    onRealtimeEventRef.current = onRealtimeEvent;
  }, [onRealtimeEvent]);

  const from = dateFilter?.from ?? defaultFrom();
  const to = dateFilter?.to;

  const fetchLeads = useCallback(async () => {
    try {
      let query = supabase
        .from('leads_dasprent')
        .select('*')
        .gte('created_at', from.toISOString())
        .order('created_at', { ascending: false })
        .limit(MAX_LEADS);

      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        query = query.lte('created_at', toEnd.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('❌ Erro ao buscar leads:', error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [from.toISOString(), to?.toISOString()]);

  useEffect(() => {
    setLoading(true);
    fetchLeads();

    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads_dasprent' },
        (payload) => {
          setLastActivity(new Date());
          onRealtimeEventRef.current?.(payload);

          if (payload.eventType === 'INSERT') {
            const newLead = payload.new as Lead;
            setLeads((current) => {
              if (current.find((l) => l.id === newLead.id)) return current;
              return [newLead, ...current];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedLead = payload.new as Lead;
            const oldLead = payload.old as { gestor_responsavel?: string };

            const gestorMudou =
              (!oldLead.gestor_responsavel || oldLead.gestor_responsavel === '') &&
              updatedLead.gestor_responsavel &&
              updatedLead.gestor_responsavel !== '';

            if (gestorMudou) {
              supabase.auth
                .getUser()
                .then(async ({ data: { user } }) => {
                  if (!user) return;
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('nome')
                    .eq('id', user.id)
                    .single();
                  if (profile?.nome !== updatedLead.gestor_responsavel) {
                    setLeads((current) => current.filter((l) => l.id !== updatedLead.id));
                  } else {
                    setLeads((current) =>
                      current.map((l) => (l.id === updatedLead.id ? updatedLead : l))
                    );
                  }
                })
                .catch(console.error);
            } else {
              setLeads((current) =>
                current.map((l) => (l.id === updatedLead.id ? updatedLead : l))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setLeads((current) => current.filter((l) => l.id !== (payload.old as Lead).id));
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') setLastActivity(new Date());
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  const updateLead = useCallback((updatedLead: Partial<Lead> & { id: string }) => {
    setLeads((current) =>
      current.map((l) => (l.id === updatedLead.id ? { ...l, ...updatedLead } : l))
    );
  }, []);

  const deleteLead = useCallback((leadId: string) => {
    setLeads((current) => current.filter((l) => l.id !== leadId));
  }, []);

  return {
    leads,
    loading,
    isConnected,
    lastActivity,
    updateLead,
    deleteLead,
    refetchLeads: fetchLeads,
  };
};
