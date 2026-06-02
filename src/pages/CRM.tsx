import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  rectIntersection,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCampaignTags } from '@/hooks/useCampaignTags';
import { useRealTimeLeads } from '@/hooks/useRealTimeLeads';
import { useFormularioTags } from '@/hooks/useFormularioTags';
import { useIsMobile } from '@/hooks/use-mobile';
import { matchesSearch } from '@/lib/utils';

import { LeadCard } from '@/components/crm/LeadCard';
import { ColumnContainer } from '@/components/crm/ColumnContainer';
import { CRMStats } from '@/components/crm/CRMStats';
import { CRMFilters, FilterState } from '@/components/crm/CRMFilters';
import { RealtimeStatus } from '@/components/crm/RealtimeStatus';
import { CRMListView } from '@/components/crm/CRMListView';
import { CRMViewToggle } from '@/components/crm/CRMViewToggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';

import type { Lead } from '@/types/lead';

const statusColumns = [
  {
    id: 'novo',
    title: 'Novos',
    color: 'from-blue-500/20 to-blue-600/20 border-blue-500/50',
    icon: '🆕',
  },
  {
    id: 'contactado',
    title: 'Contactados',
    color: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/50',
    icon: '📞',
  },
  {
    id: 'interessado',
    title: 'Interessados',
    color: 'from-green-500/20 to-green-600/20 border-green-500/50',
    icon: '✅',
  },
  {
    id: 'convertido',
    title: 'Convertidos',
    color: 'from-purple-500/20 to-purple-600/20 border-purple-500/50',
    icon: '🎉',
  },
  {
    id: 'perdido',
    title: 'Perdidos',
    color: 'from-red-500/20 to-red-600/20 border-red-500/50',
    icon: '❌',
  },
];

const CRM = () => {
  const isMobile = useIsMobile();
  const [realtimePayload, setRealtimePayload] = useState<any>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'todos',
    dateRange: 'todos',
    customStartDate: undefined,
    customEndDate: undefined,
    campaignTags: [],
    userId: 'todos',
  });

  const handleRealtimeEvent = useCallback((payload: any) => {
    setRealtimePayload(payload);
  }, []);

  const {
    leads,
    loading,
    isConnected,
    lastActivity,
    updateLead: updateLeadHook,
    deleteLead: deleteLeadHook,
    refetchLeads,
  } = useRealTimeLeads(handleRealtimeEvent, {
    from: filters.customStartDate ? new Date(filters.customStartDate) : undefined,
    to: filters.customEndDate ? new Date(filters.customEndDate) : undefined,
  });

  const { tagsMap, getTagsForFormulario } = useFormularioTags();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>(() => {
    const saved = localStorage.getItem('crm-view-mode');
    return saved === 'lista' ? 'lista' : 'kanban';
  });

  // Persistir preferência de vista no localStorage
  useEffect(() => {
    localStorage.setItem('crm-view-mode', viewMode);
  }, [viewMode]);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [userLeadHistory, setUserLeadHistory] = useState<Record<string, string[]>>({});
  const { toast } = useToast();
  const { availableTags, refreshTags } = useCampaignTags();

  // Configure sensors for better drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  // Buscar usuário atual e configurar filtro inicial
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          console.error('Erro ao obter usuário atual:', userError);
          setFilters((prev) => ({ ...prev, userId: 'todos' }));
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('nome, is_admin')
          .eq('id', user.id)
          .single();

        if (profileError || !profile?.nome) {
          console.error('Erro ao obter perfil do usuário:', profileError);
          setFilters((prev) => ({ ...prev, userId: 'todos' }));
          return;
        }

        setCurrentUserName(profile.nome);
        // Não aplicar filtro automático pelo usuário logado
        setFilters((prev) => ({ ...prev, userId: 'todos' }));
      } catch (error) {
        console.error('Erro ao configurar filtro inicial:', error);
        setFilters((prev) => ({ ...prev, userId: 'todos' }));
      }
    };

    fetchCurrentUser();
  }, []);

  // Configurar realtime subscriptions no hook personalizado
  // useRealTimeLeads já cuida de tudo isso

  const fetchUserLeadHistory = async () => {
    try {
      // First get user IDs and names
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nome');

      if (profilesError) throw profilesError;

      // Then get lead history
      const { data, error } = await supabase
        .from('lead_status_history')
        .select('lead_id, alterado_por')
        .not('alterado_por', 'is', null);

      if (error) throw error;

      // Group lead IDs by user NAME (not ID)
      const history: Record<string, string[]> = {};
      data?.forEach((record) => {
        const userProfile = profiles?.find((p) => p.id === record.alterado_por);
        if (userProfile?.nome) {
          const userName = userProfile.nome;
          if (!history[userName]) {
            history[userName] = [];
          }
          if (!history[userName].includes(record.lead_id)) {
            history[userName].push(record.lead_id);
          }
        }
      });

      setUserLeadHistory(history);
    } catch (error) {
      console.error('Error fetching user lead history:', error);
    }
  };

  // Filter leads based on current filter state
  const filteredLeads = useMemo(() => {
    let result = [...leads];

    // Search filter
    if (filters.search) {
      result = result.filter(
        (lead) =>
          matchesSearch(lead.nome, filters.search) ||
          matchesSearch(lead.email, filters.search) ||
          matchesSearch(lead.telefone, filters.search)
      );
    }

    // Status filter
    if (filters.status !== 'todos') {
      result = result.filter((lead) => lead.status === filters.status);
    }

    // Campaign tags filter
    if (filters.campaignTags.length > 0) {
      result = result.filter((lead) => {
        if (!lead.campaign_tags || lead.campaign_tags.length === 0) return false;
        return filters.campaignTags.some((filterTag) => lead.campaign_tags!.includes(filterTag));
      });
    }

    // User filter - inclui leads atribuídos ao usuário E leads sem gestor (disponíveis)
    if (filters.userId !== 'todos') {
      result = result.filter(
        (lead) =>
          lead.gestor_responsavel === filters.userId ||
          !lead.gestor_responsavel ||
          lead.gestor_responsavel === ''
      );
    }

    // Filtro de datas aplicado no servidor (useRealTimeLeads)

    return result;
  }, [leads, filters]);

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      // Buscar o lead atual para verificar se tem gestor
      const currentLead = leads.find((lead) => lead.id === leadId);

      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Se o lead não tem gestor responsável, atribuir o usuário atual
      if (currentLead && !currentLead.gestor_responsavel) {
        try {
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();
          if (!userError && user) {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('nome')
              .eq('id', user.id)
              .single();

            if (!profileError && profile?.nome) {
              updateData.gestor_responsavel = profile.nome;
              console.log(`Gestor ${profile.nome} atribuído automaticamente ao lead`);
            }
          }
        } catch (error) {
          console.error('Erro ao atribuir gestor:', error);
          // Continuar sem atribuir gestor se houver erro
        }
      }

      const { error } = await supabase.from('leads_dasprent').update(updateData).eq('id', leadId);

      updateLeadHook({ id: leadId, ...updateData });

      toast({
        title: 'Sucesso',
        description: 'Status do lead atualizado',
      });
    } catch (error) {
      console.error('Error updating lead status:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar status do lead',
        variant: 'destructive',
      });
    }
  };

  const updateLead = async (updatedLead: Partial<Lead> & { id: string }) => {
    console.log('CRM updateLead - updatedLead received:', updatedLead);

    try {
      const { error } = await supabase
        .from('leads_dasprent')
        .update({
          ...updatedLead,
          updated_at: new Date().toISOString(),
        })
        .eq('id', updatedLead.id);

      console.log('CRM updateLead - Supabase update result:', { error });

      updateLeadHook(updatedLead);

      toast({
        title: 'Sucesso',
        description: 'Lead atualizado com sucesso',
      });
    } catch (error) {
      console.error('CRM updateLead - Error updating lead:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar lead',
        variant: 'destructive',
      });
    }
  };

  const assignGestorsFromHistory = async () => {
    try {
      console.log('🔄 Executando atribuição automática de gestores...');

      const { data, error } = await supabase.rpc('execute_gestor_assignment');

      if (error) throw error;

      const updatedCount = data || 0;

      if (updatedCount > 0) {
        // Recarregar a lista de leads
        await refetchLeads();

        toast({
          title: '✅ Atribuição Concluída',
          description: `${updatedCount} leads foram atualizados com gestores baseado no histórico`,
        });

        console.log(`🎉 ${updatedCount} leads atualizados com gestores!`);
      } else {
        toast({
          title: 'ℹ️ Nenhuma alteração',
          description: 'Todos os leads já têm gestores atribuídos ou não há histórico disponível',
        });
      }
    } catch (error) {
      console.error('❌ Erro ao executar atribuição:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atribuir gestores baseado no histórico',
        variant: 'destructive',
      });
    }
  };

  const deleteLead = async (leadId: string) => {
    try {
      const { error } = await supabase.from('leads_dasprent').delete().eq('id', leadId);

      deleteLeadHook(leadId);

      toast({
        title: 'Sucesso',
        description: 'Lead excluído com sucesso',
      });
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir lead',
        variant: 'destructive',
      });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    console.log('Drag started:', event.active.id);
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    console.log('Drag ended:', {
      active: event.active.id,
      over: event.over?.id,
      overData: event.over?.data?.current,
    });
    const { active, over } = event;

    if (!over) {
      console.log('No drop target found');
      setActiveId(null);
      return;
    }

    const leadId = active.id as string;
    const overElement = over.id as string;
    const overData = over.data?.current;

    console.log('Processing drop:', { leadId, overElement, overType: overData?.type });

    let newStatus: string;
    const validStatuses = statusColumns.map((col) => col.id);

    // Prioritize column drops over lead drops
    if (overData?.type === 'column' && validStatuses.includes(overElement)) {
      // Dropped directly on a column
      console.log('Dropped on column:', overElement);
      newStatus = overElement;
    } else if (validStatuses.includes(overElement)) {
      // Dropped directly on a column (fallback)
      console.log('Dropped on column (fallback):', overElement);
      newStatus = overElement;
    } else {
      // Dropped on another lead, find which column it belongs to
      const targetLead = filteredLeads.find((lead) => lead.id === overElement);
      if (targetLead) {
        console.log('Dropped on lead:', targetLead.nome, 'with status:', targetLead.status);
        newStatus = targetLead.status;
      } else {
        console.log('Invalid drop target:', overElement);
        setActiveId(null);
        return;
      }
    }

    // Only update if status actually changed
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (currentLead && currentLead.status !== newStatus) {
      console.log(
        `Updating lead ${leadId} (${currentLead.nome}) from ${currentLead.status} to ${newStatus}`
      );
      updateLeadStatus(leadId, newStatus);
    } else {
      console.log('No status change needed or lead not found');
    }

    setActiveId(null);
  };

  const generateReport = async (userId: string, userLeads: any[]) => {
    try {
      console.log('Generating report for:', userId, 'with leads:', userLeads.length);

      // Calculate local statistics
      const totalLeads = userLeads.length;
      const statusCounts = {
        novo: userLeads.filter((lead) => lead.status === 'novo').length,
        contactado: userLeads.filter((lead) => lead.status === 'contactado').length,
        interessado: userLeads.filter((lead) => lead.status === 'interessado').length,
        convertido: userLeads.filter((lead) => lead.status === 'convertido').length,
        perdido: userLeads.filter((lead) => lead.status === 'perdido').length,
      };

      const conversionRate =
        totalLeads > 0 ? ((statusCounts.convertido / totalLeads) * 100).toFixed(1) : '0';
      const interestRate =
        totalLeads > 0
          ? (((statusCounts.interessado + statusCounts.convertido) / totalLeads) * 100).toFixed(1)
          : '0';
      const lossRate =
        totalLeads > 0 ? ((statusCounts.perdido / totalLeads) * 100).toFixed(1) : '0';

      // Calculate campaign tags
      const campaignTags: Record<string, number> = {};
      userLeads.forEach((lead) => {
        if (lead.campaign_tags) {
          lead.campaign_tags.forEach((tag: string) => {
            campaignTags[tag] = (campaignTags[tag] || 0) + 1;
          });
        }
      });

      const dateRange = `${new Date(Math.min(...userLeads.map((l) => new Date(l.created_at).getTime()))).toLocaleDateString('pt-BR')} - ${new Date().toLocaleDateString('pt-BR')}`;

      // Create simple HTML report without external dependencies
      const reportWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');

      if (reportWindow) {
        reportWindow.document.write(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Relatório - ${userId}</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background: linear-gradient(135deg, #1f2937 0%, #111827 50%, #0f172a 100%);
                color: white;
                min-height: 100vh;
              }
              .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
              .header { 
                background: linear-gradient(to right, rgba(55, 65, 81, 0.8), rgba(17, 24, 39, 0.8));
                padding: 2rem;
                border-bottom: 1px solid rgba(107, 114, 128, 0.5);
                margin-bottom: 2rem;
                border-radius: 0.75rem;
              }
              .title { 
                font-size: 2.5rem; 
                font-weight: bold; 
                background: linear-gradient(to right, #facc15, #eab308);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 0.5rem;
              }
              .subtitle { font-size: 1.25rem; color: #d1d5db; }
              .date-info { text-align: right; color: #9ca3af; }
              
              .metrics-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
                gap: 1.5rem; 
                margin-bottom: 2rem; 
              }
              .metric-card { 
                padding: 1.5rem; 
                border-radius: 0.75rem; 
                border: 1px solid;
                display: flex;
                align-items: center;
                gap: 1rem;
              }
              .metric-blue { 
                background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.2)); 
                border-color: rgba(59, 130, 246, 0.5); 
              }
              .metric-green { 
                background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.2)); 
                border-color: rgba(34, 197, 94, 0.5); 
              }
              .metric-yellow { 
                background: linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(202, 138, 4, 0.2)); 
                border-color: rgba(234, 179, 8, 0.5); 
              }
              .metric-purple { 
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(124, 58, 237, 0.2)); 
                border-color: rgba(139, 92, 246, 0.5); 
              }
              .metric-icon { font-size: 2.5rem; }
              .metric-label { font-size: 0.875rem; color: #9ca3af; }
              .metric-value { font-size: 2rem; font-weight: bold; }
              .metric-blue .metric-value { color: #60a5fa; }
              .metric-green .metric-value { color: #4ade80; }
              .metric-yellow .metric-value { color: #facc15; }
              .metric-purple .metric-value { color: #a78bfa; }
              
              .charts-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); 
                gap: 2rem; 
                margin-bottom: 2rem; 
              }
              .chart-card { 
                background: linear-gradient(135deg, rgba(55, 65, 81, 0.5), rgba(17, 24, 39, 0.5));
                padding: 1.5rem;
                border-radius: 0.75rem;
                border: 1px solid rgba(107, 114, 128, 0.5);
              }
              .chart-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: #e5e7eb; }
              .chart-container { height: 320px; position: relative; }
              
              .status-details { 
                background: linear-gradient(135deg, rgba(55, 65, 81, 0.5), rgba(17, 24, 39, 0.5));
                padding: 1.5rem;
                border-radius: 0.75rem;
                border: 1px solid rgba(107, 114, 128, 0.5);
                margin-bottom: 2rem;
              }
              .status-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                gap: 1rem; 
                margin-top: 1.5rem;
              }
              .status-item { 
                background: rgba(55, 65, 81, 0.5); 
                padding: 1rem; 
                border-radius: 0.5rem; 
                border: 1px solid rgba(75, 85, 99, 0.5);
                display: flex;
                align-items: center;
                gap: 0.75rem;
              }
              .status-color { width: 1rem; height: 1rem; border-radius: 50%; }
              .status-name { font-size: 0.875rem; color: #9ca3af; }
              .status-count { font-size: 1.5rem; font-weight: bold; }
              .status-percent { font-size: 0.75rem; color: #6b7280; }
              
              .print-btn { 
                position: fixed; 
                top: 1rem; 
                right: 1rem; 
                background: #eab308; 
                color: black; 
                padding: 0.75rem 1.5rem; 
                border: none; 
                border-radius: 0.5rem; 
                font-weight: 600; 
                cursor: pointer; 
                z-index: 1000;
                transition: background-color 0.2s;
              }
              .print-btn:hover { background: #ca8a04; }
              
              .footer { 
                text-align: center; 
                color: #6b7280; 
                font-size: 0.875rem; 
                border-top: 1px solid rgba(107, 114, 128, 0.5); 
                padding-top: 1.5rem; 
              }
              
               @media print {
                @page {
                  margin: 0.5in;
                  size: A4;
                }
                body { 
                  background: white !important; 
                  color: black !important;
                  font-size: 16px !important;
                  line-height: 1.4 !important;
                }
                .print-btn { display: none !important; }
                .container { 
                  padding: 0 !important; 
                  max-width: 100% !important;
                  height: 100% !important;
                }
                .header { 
                  background: white !important; 
                  border: 1px solid #ccc !important; 
                  padding: 1rem !important;
                  margin-bottom: 1rem !important;
                  page-break-inside: avoid;
                }
                .header > div {
                  flex-direction: column !important;
                  align-items: flex-start !important;
                  gap: 0.5rem !important;
                }
                .title { 
                  color: black !important; 
                  -webkit-text-fill-color: black !important; 
                  font-size: 2rem !important;
                  margin-bottom: 0.3rem !important;
                  line-height: 1.1 !important;
                }
                .subtitle { 
                  color: #333 !important; 
                  font-size: 1.2rem !important;
                  margin: 0 !important;
                }
                .date-info { 
                  font-size: 1rem !important; 
                  text-align: left !important;
                  margin-top: 0.5rem !important;
                }
                .metrics-grid { 
                  display: grid !important;
                  grid-template-columns: repeat(4, 1fr) !important;
                  gap: 0.8rem !important; 
                  margin-bottom: 1rem !important;
                }
                .metric-card { 
                  background: white !important; 
                  border: 1px solid #ccc !important; 
                  padding: 0.8rem !important;
                  border-radius: 0.25rem !important;
                  page-break-inside: avoid;
                  min-height: 80px !important;
                }
                .metric-card > div {
                  flex-direction: column !important;
                  align-items: center !important;
                  gap: 0.4rem !important;
                  text-align: center !important;
                }
                .metric-icon { 
                  font-size: 1.8rem !important; 
                  line-height: 1 !important;
                }
                .metric-value { 
                  color: #333 !important; 
                  font-size: 1.4rem !important;
                  font-weight: bold !important;
                  margin: 0 !important;
                }
                .metric-label { 
                  font-size: 0.9rem !important; 
                  margin: 0 !important;
                  color: #666 !important;
                }
                .charts-grid { 
                  display: block !important;
                  margin-bottom: 1rem !important;
                }
                .chart-card { 
                  background: white !important; 
                  border: 1px solid #ccc !important; 
                  padding: 1rem !important;
                  margin-bottom: 0.8rem !important;
                  page-break-inside: avoid;
                  width: 48% !important;
                  display: inline-block !important;
                  vertical-align: top !important;
                  min-height: 220px !important;
                }
                .chart-card:nth-child(odd) {
                  margin-right: 4% !important;
                }
                .chart-title { 
                  font-size: 1.1rem !important; 
                  margin-bottom: 0.6rem !important;
                  color: #333 !important;
                  font-weight: 600 !important;
                }
                .chart-container { 
                  height: 180px !important;
                  width: 100% !important;
                }
                .status-details { 
                  background: white !important; 
                  border: 1px solid #ccc !important; 
                  padding: 1rem !important;
                  page-break-inside: avoid;
                  margin-bottom: 0.8rem !important;
                }
                .status-grid { 
                  display: grid !important;
                  grid-template-columns: repeat(5, 1fr) !important;
                  gap: 0.6rem !important; 
                  margin-top: 0.6rem !important;
                }
                .status-item { 
                  background: white !important; 
                  border: 1px solid #ddd !important; 
                  padding: 0.6rem !important;
                  border-radius: 0.25rem !important;
                  text-align: center !important;
                  min-height: 70px !important;
                }
                .status-item > div {
                  flex-direction: column !important;
                  align-items: center !important;
                  gap: 0.25rem !important;
                }
                .status-color {
                  width: 1rem !important;
                  height: 1rem !important;
                  margin: 0 auto 0.25rem auto !important;
                }
                .status-count { 
                  font-size: 1.2rem !important;
                  font-weight: bold !important;
                  margin: 0 !important;
                }
                .status-name { 
                  font-size: 0.85rem !important;
                  margin: 0 !important;
                  color: #666 !important;
                }
                .status-percent { 
                  font-size: 0.8rem !important;
                  margin: 0 !important;
                  color: #888 !important;
                }
                .footer { 
                  font-size: 0.9rem !important; 
                  padding-top: 0.6rem !important;
                  margin-top: 0.6rem !important;
                  text-align: center !important;
                  color: #666 !important;
                }
                .footer p {
                  margin: 0.25rem 0 !important;
                }
                /* Remove excessive margins but keep some breathing room */
                * {
                  box-sizing: border-box !important;
                }
                /* Ensure charts resize properly */
                canvas {
                  max-width: 100% !important;
                  max-height: 180px !important;
                }
              }
            </style>
          </head>
          <body>
            <button class="print-btn" onclick="window.print()">🖨️ Imprimir Relatório</button>
            
            <div class="container">
              <div class="header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <h1 class="title">Relatório de Desempenho</h1>
                    <p class="subtitle">${userId}</p>
                  </div>
                  <div class="date-info">
                    <div>📅 ${new Date().toLocaleDateString('pt-BR')}</div>
                    <div style="font-size: 0.875rem; margin-top: 0.25rem;">Período: ${dateRange}</div>
                  </div>
                </div>
              </div>
              
              <div class="metrics-grid">
                <div class="metric-card metric-blue">
                  <div class="metric-icon">👥</div>
                  <div>
                    <div class="metric-label">Total de Leads</div>
                    <div class="metric-value">${totalLeads}</div>
                  </div>
                </div>
                
                <div class="metric-card metric-green">
                  <div class="metric-icon">🎯</div>
                  <div>
                    <div class="metric-label">Taxa de Conversão</div>
                    <div class="metric-value">${conversionRate}%</div>
                  </div>
                </div>
                
                <div class="metric-card metric-yellow">
                  <div class="metric-icon">💰</div>
                  <div>
                    <div class="metric-label">Taxa de Interesse</div>
                    <div class="metric-value">${interestRate}%</div>
                  </div>
                </div>
                
                <div class="metric-card metric-purple">
                  <div class="metric-icon">📉</div>
                  <div>
                    <div class="metric-label">Taxa de Perda</div>
                    <div class="metric-value">${lossRate}%</div>
                  </div>
                </div>
              </div>
              
              <div class="charts-grid">
                <div class="chart-card">
                  <h3 class="chart-title">Distribuição por Status</h3>
                  <div class="chart-container">
                    <canvas id="statusChart"></canvas>
                  </div>
                </div>
                
                <div class="chart-card">
                  <h3 class="chart-title">Campanhas Mais Efetivas</h3>
                  <div class="chart-container">
                    <canvas id="campaignChart"></canvas>
                  </div>
                </div>
              </div>
              
              <div class="status-details">
                <h3 class="chart-title">Detalhamento por Status</h3>
                <div class="status-grid">
                  <div class="status-item">
                    <div class="status-color" style="background-color: #3b82f6;"></div>
                    <div>
                      <div class="status-name">Novos</div>
                      <div class="status-count" style="color: #60a5fa;">${statusCounts.novo}</div>
                      <div class="status-percent">${totalLeads > 0 ? ((statusCounts.novo / totalLeads) * 100).toFixed(1) : '0'}%</div>
                    </div>
                  </div>
                  
                  <div class="status-item">
                    <div class="status-color" style="background-color: #eab308;"></div>
                    <div>
                      <div class="status-name">Contactados</div>
                      <div class="status-count" style="color: #facc15;">${statusCounts.contactado}</div>
                      <div class="status-percent">${totalLeads > 0 ? ((statusCounts.contactado / totalLeads) * 100).toFixed(1) : '0'}%</div>
                    </div>
                  </div>
                  
                  <div class="status-item">
                    <div class="status-color" style="background-color: #22c55e;"></div>
                    <div>
                      <div class="status-name">Interessados</div>
                      <div class="status-count" style="color: #4ade80;">${statusCounts.interessado}</div>
                      <div class="status-percent">${totalLeads > 0 ? ((statusCounts.interessado / totalLeads) * 100).toFixed(1) : '0'}%</div>
                    </div>
                  </div>
                  
                  <div class="status-item">
                    <div class="status-color" style="background-color: #8b5cf6;"></div>
                    <div>
                      <div class="status-name">Convertidos</div>
                      <div class="status-count" style="color: #a78bfa;">${statusCounts.convertido}</div>
                      <div class="status-percent">${totalLeads > 0 ? ((statusCounts.convertido / totalLeads) * 100).toFixed(1) : '0'}%</div>
                    </div>
                  </div>
                  
                  <div class="status-item">
                    <div class="status-color" style="background-color: #ef4444;"></div>
                    <div>
                      <div class="status-name">Perdidos</div>
                      <div class="status-count" style="color: #f87171;">${statusCounts.perdido}</div>
                      <div class="status-percent">${totalLeads > 0 ? ((statusCounts.perdido / totalLeads) * 100).toFixed(1) : '0'}%</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="footer">
                <p>Relatório gerado automaticamente pelo sistema CRM DasPrent</p>
                <p>Data de geração: ${new Date().toLocaleString('pt-BR')}</p>
              </div>
            </div>
            
            <script>
              // Wait for Chart.js to load
              window.addEventListener('load', function() {
                // Status Chart
                const statusCtx = document.getElementById('statusChart');
                if (statusCtx && window.Chart) {
                  new Chart(statusCtx, {
                    type: 'doughnut',
                    data: {
                      labels: ['Novos', 'Contactados', 'Interessados', 'Convertidos', 'Perdidos'],
                      datasets: [{
                        data: [${statusCounts.novo}, ${statusCounts.contactado}, ${statusCounts.interessado}, ${statusCounts.convertido}, ${statusCounts.perdido}],
                        backgroundColor: ['#3B82F6', '#EAB308', '#22C55E', '#8B5CF6', '#EF4444'],
                        borderColor: ['#1D4ED8', '#D97706', '#16A34A', '#7C3AED', '#DC2626'],
                        borderWidth: 2
                      }]
                    },
                    options: {
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          labels: { color: '#D1D5DB' }
                        }
                      }
                    }
                  });
                }

                // Campaign Chart
                const campaignCtx = document.getElementById('campaignChart');
                const campaignLabels = ${JSON.stringify(Object.keys(campaignTags).slice(0, 5))};
                const campaignData = ${JSON.stringify(Object.values(campaignTags).slice(0, 5))};
                
                if (campaignCtx && window.Chart && campaignLabels.length > 0) {
                  new Chart(campaignCtx, {
                    type: 'bar',
                    data: {
                      labels: campaignLabels,
                      datasets: [{
                        label: 'Leads',
                        data: campaignData,
                        backgroundColor: '#EAB308',
                        borderColor: '#F59E0B',
                        borderWidth: 1
                      }]
                    },
                    options: {
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          labels: { color: '#D1D5DB' }
                        }
                      },
                      scales: {
                        y: {
                          ticks: { color: '#9CA3AF' },
                          grid: { color: '#374151' }
                        },
                        x: {
                          ticks: { color: '#9CA3AF' },
                          grid: { color: '#374151' }
                        }
                      }
                    }
                  });
                } else if (campaignCtx) {
                  campaignCtx.parentElement.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 2rem;">Nenhuma campanha encontrada</div>';
                }
              });
            </script>
          </body>
          </html>
        `);
        reportWindow.document.close();

        console.log('Report window opened successfully');
      } else {
        console.error('Failed to open report window');
        throw new Error('Não foi possível abrir a janela do relatório');
      }

      toast({
        title: 'Sucesso',
        description: 'Relatório gerado com sucesso!',
      });
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao gerar o relatório: ' + (error?.message || error),
        variant: 'destructive',
      });
    }
  };

  const getLeadsByStatus = (status: string) => {
    return filteredLeads.filter((lead) => lead.status === status);
  };

  const activeLead = activeId ? leads.find((lead) => lead.id === activeId) : null;

  if (loading) {
    return (
      <div className="min-h-screen flex w-full bg-background">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-foreground text-lg">Carregando CRM...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent hidden dark:block" />
      <div className="absolute inset-0 bg-grid-foreground/[0.02] bg-[size:60px_60px] hidden dark:block" />

      <div className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          {/* CRM Header: Stats and Filters */}
          <div className="mb-4 space-y-4">
            <div className="flex justify-between items-center px-1">
              <CRMViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
              <RealtimeStatus isConnected={isConnected} lastActivity={lastActivity} />
            </div>

            <CRMStats leads={leads} statusColumns={statusColumns} />

            <CRMFilters
              filters={filters}
              onFilterChange={setFilters}
              statusColumns={statusColumns}
              totalLeads={leads.length}
              filteredCount={filteredLeads.length}
              availableTags={availableTags}
              onGenerateReport={generateReport}
              filteredLeads={filteredLeads}
            />
          </div>

          {/* Kanban Board - Mobile with Tabs, Desktop with Drag & Drop */}
          {viewMode === 'lista' ? (
            <CRMListView
              leads={filteredLeads}
              statusColumns={statusColumns}
              getTagsForFormulario={getTagsForFormulario}
            />
          ) : isMobile ? (
            <Tabs defaultValue="novo" className="w-full">
              <TabsList className="grid w-full grid-cols-5 mb-4">
                {statusColumns.map((column) => (
                  <TabsTrigger key={column.id} value={column.id} className="text-xs px-2">
                    {column.icon}
                  </TabsTrigger>
                ))}
              </TabsList>
              {statusColumns.map((column) => (
                <TabsContent key={column.id} value={column.id} className="mt-0">
                  <ColumnContainer
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    color={column.color}
                    icon={column.icon}
                    count={getLeadsByStatus(column.id).length}
                  >
                    <SortableContext
                      items={getLeadsByStatus(column.id).map((lead) => lead.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {getLeadsByStatus(column.id).map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          customTags={getTagsForFormulario(lead.formulario_id)}
                        />
                      ))}
                    </SortableContext>
                  </ColumnContainer>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mt-8">
                {statusColumns.map((column) => (
                  <ColumnContainer
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    color={column.color}
                    icon={column.icon}
                    count={getLeadsByStatus(column.id).length}
                  >
                    <SortableContext
                      items={getLeadsByStatus(column.id).map((lead) => lead.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {getLeadsByStatus(column.id).map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          customTags={getTagsForFormulario(lead.formulario_id)}
                        />
                      ))}
                    </SortableContext>
                  </ColumnContainer>
                ))}
              </div>

              <DragOverlay>
                {activeLead && (
                  <div className="rotate-3 scale-105">
                    <LeadCard
                      lead={activeLead}
                      customTags={getTagsForFormulario(activeLead.formulario_id)}
                    />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
};

export default CRM;
