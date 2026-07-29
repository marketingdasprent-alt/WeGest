import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, Webhook, Play, Settings } from 'lucide-react';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { IntegracaoCard, type IntegracaoCardData } from './IntegracaoCard';
import { IntegracaoDialog } from './IntegracaoDialog';
import { IntegracaoDetailModal } from './IntegracaoDetailModal';
import {
  FaturacaoIntegracaoDialog,
  type FaturacaoConfigRow,
} from './faturacao/FaturacaoIntegracaoDialog';
import {
  EditarIntegracaoEmailDialog,
  type EmailIntegracaoRow,
} from './EditarIntegracaoEmailDialog';
import { faturacaoProviderLabel } from '@/lib/faturacaoProviders';
import { ImportRobotCsvDialog } from './ImportRobotCsvDialog';
import { ViaVerdeContaDialog } from './via-verde/ViaVerdeContaDialog';
import { ImportUberCsvDialog } from '../administrativo/ImportUberCsvDialog';
import type { IntegracaoConfig } from './integracoes/types';
import type { ViaVerdeConta } from './via-verde/types';

interface IntegracaoWebhook {
  id: string;
  nome: string;
  descricao: string | null;
  url: string;
  evento: string;
  ativo: boolean;
  headers: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

const EVENTOS_DISPONIVEIS = [
  {
    value: 'ticket_criado',
    label: 'Ticket Criado',
    description: 'Quando um novo ticket de assistência é criado',
  },
  {
    value: 'ticket_atualizado',
    label: 'Ticket Atualizado',
    description: 'Quando o status de um ticket é alterado',
  },
  { value: 'lead_criado', label: 'Lead Criado', description: 'Quando um novo lead é registado' },
  {
    value: 'motorista_aprovado',
    label: 'Motorista Aprovado',
    description: 'Quando uma candidatura é aprovada',
  },
];

export const IntegracoesTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  // Unified cards data
  const [cards, setCards] = useState<IntegracaoCardData[]>([]);
  const [rawIntegracoes, setRawIntegracoes] = useState<IntegracaoConfig[]>([]);
  const [rawViaVerdeContas, setRawViaVerdeContas] = useState<ViaVerdeConta[]>([]);
  const [viaVerdeIntegracaoId, setViaVerdeIntegracaoId] = useState<string | null>(null);

  // Dialogs
  const [newIntegracaoDialogOpen, setNewIntegracaoDialogOpen] = useState(false);
  const [deleteIntegracaoDialogOpen, setDeleteIntegracaoDialogOpen] = useState(false);
  const [selectedDeleteCard, setSelectedDeleteCard] = useState<IntegracaoCardData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedIntegracao, setSelectedIntegracao] = useState<IntegracaoConfig | null>(null);
  const [viaVerdeDialogOpen, setViaVerdeDialogOpen] = useState(false);
  const [selectedViaVerdeConta, setSelectedViaVerdeConta] = useState<ViaVerdeConta | null>(null);
  const [importRobotDialogOpen, setImportRobotDialogOpen] = useState(false);
  const [selectedRobotIntegracaoId, setSelectedRobotIntegracaoId] = useState<string>('');
  const [importUberDialogOpen, setImportUberDialogOpen] = useState(false);
  const [selectedUberIntegracaoId, setSelectedUberIntegracaoId] = useState<string>('');
  const [executingRobots, setExecutingRobots] = useState<Set<string>>(new Set());

  // Faturação fiscal (config por-org)
  const [faturacaoDialogOpen, setFaturacaoDialogOpen] = useState(false);
  const [faturacaoRow, setFaturacaoRow] = useState<FaturacaoConfigRow | null>(null);
  const [editEmailDialogOpen, setEditEmailDialogOpen] = useState(false);
  const [editEmailRow, setEditEmailRow] = useState<EmailIntegracaoRow | null>(null);

  // Webhooks
  const [webhooks, setWebhooks] = useState<IntegracaoWebhook[]>([]);
  const [webhookSortField, setWebhookSortField] = useState<string>('nome');
  const [webhookSortDir, setWebhookSortDir] = useState<'asc' | 'desc'>('asc');
  const handleWebhookSort = (f: string) =>
    toggleSort(
      f,
      { sortField: webhookSortField, sortDir: webhookSortDir },
      setWebhookSortField,
      setWebhookSortDir
    );
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [deleteWebhookDialogOpen, setDeleteWebhookDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<IntegracaoWebhook | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [webhookFormData, setWebhookFormData] = useState({
    nome: '',
    descricao: '',
    url: '',
    evento: '',
    ativo: true,
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);

      // Fetch all integrations in parallel
      const [plataformasRes, webhooksRes] = await Promise.all([
        supabase
          .from('plataformas_configuracao')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('integracoes_webhooks').select('*').order('created_at', { ascending: false }),
      ]);

      if (plataformasRes.error) throw plataformasRes.error;
      if (webhooksRes.error) throw webhooksRes.error;

      const integracoes = (plataformasRes.data || []) as IntegracaoConfig[];
      setRawIntegracoes(integracoes);
      setWebhooks((webhooksRes.data || []) as IntegracaoWebhook[]);

      // Find Via Verde integração and fetch its contas
      const vvIntegracao = integracoes.find((i) => i.plataforma === 'via_verde');
      let vvContas: ViaVerdeConta[] = [];
      if (vvIntegracao) {
        setViaVerdeIntegracaoId(vvIntegracao.id);
        const supabaseAny = supabase as any;
        const { data } = await supabaseAny
          .from('via_verde_contas')
          .select('*')
          .eq('integracao_id', vvIntegracao.id)
          .order('created_at', { ascending: false });
        vvContas = (data || []) as ViaVerdeConta[];
        setRawViaVerdeContas(vvContas);
      }

      // Build unified card list
      buildCards(integracoes, vvContas);
    } catch (error: any) {
      console.error('Erro ao carregar integrações:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as integrações.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const buildCards = (integracoes: IntegracaoConfig[], vvContas: ViaVerdeConta[]) => {
    const result: IntegracaoCardData[] = [];

    // Bolt, Uber & Robot integrations
    integracoes
      .filter((i) => i.plataforma === 'bolt' || i.plataforma === 'uber' || i.plataforma === 'robot')
      .forEach((i) => {
        const lastActivity =
          i.plataforma === 'uber' ? (i.last_webhook_at ?? i.ultimo_sync) : i.ultimo_sync;

        // Robot with known target → show as platform type in UI
        const isUberRobot = i.plataforma === 'robot' && i.robot_target_platform === 'uber';
        const isBoltRobot = i.plataforma === 'robot' && i.robot_target_platform === 'bolt';
        const isBpRobot = i.plataforma === 'robot' && i.robot_target_platform === 'bp';
        const isRepsolRobot = i.plataforma === 'robot' && i.robot_target_platform === 'repsol';
        const isEdpRobot = i.plataforma === 'robot' && i.robot_target_platform === 'edp';
        const isSimplifiedRobot =
          isUberRobot || isBoltRobot || isBpRobot || isRepsolRobot || isEdpRobot;
        const displayType = isUberRobot
          ? 'uber'
          : isBoltRobot
            ? 'bolt'
            : isBpRobot || isRepsolRobot || isEdpRobot
              ? 'combustivel'
              : (i.plataforma as 'bolt' | 'uber' | 'robot');

        result.push({
          id: i.id,
          type: displayType,
          nome: i.nome,
          ativo: i.ativo,
          ultimoSync: lastActivity,
          username: i.client_id,
          password: i.client_secret,
          connectionMode: isSimplifiedRobot
            ? 'api'
            : i.plataforma === 'uber'
              ? (i as any).auth_mode === 'webhook'
                ? 'api'
                : 'upload'
              : i.plataforma === 'robot'
                ? 'api'
                : 'api',
          subLabel:
            i.plataforma === 'robot' && !isSimplifiedRobot
              ? (i as any).apify_actor_id || undefined
              : i.company_name || undefined,
          rawData: i,
          logoUrl:
            i.logo_url ||
            (isUberRobot
              ? '/images/logo-uber.png'
              : isBoltRobot
                ? '/images/logo-bolt.png'
                : isBpRobot
                  ? '/images/logo-bp.png'
                  : isRepsolRobot
                    ? '/images/logo-repsol.png'
                    : isEdpRobot
                      ? '/images/logo-edp.png'
                      : null),
        });
      });

    // BP / Combustivel
    const bpIntegracao = integracoes.find((i) => i.plataforma === 'combustivel');
    if (bpIntegracao) {
      result.push({
        id: bpIntegracao.id,
        type: 'combustivel',
        nome: bpIntegracao.nome || 'BP Fleet',
        ativo: bpIntegracao.ativo,
        ultimoSync: bpIntegracao.ultimo_sync,
        username: bpIntegracao.client_id,
        password: bpIntegracao.client_secret,
        connectionMode: 'api',
        rawData: bpIntegracao,
        logoUrl: bpIntegracao.logo_url,
      });
    }

    // Via Verde — integrações via wizard (plataforma='via_verde' OU legacy 'viaverde'),
    // com robot Apify dedicado. Card recebe botão Play (handleExecuteRobot).
    integracoes
      .filter((i) => i.plataforma === 'via_verde' || i.plataforma === ('viaverde' as any))
      .forEach((i) => {
        const isRobotBacked = i.plataforma === 'via_verde';
        result.push({
          id: i.id,
          type: 'via_verde',
          nome: i.nome,
          ativo: i.ativo,
          ultimoSync: i.ultimo_sync,
          username: i.client_id,
          password: i.client_secret,
          connectionMode: isRobotBacked ? 'api' : 'upload',
          rawData: i,
          logoUrl: i.logo_url || '/images/logo-via-verde.png',
        });
      });

    // Via Verde contas
    vvContas.forEach((conta) => {
      const contaActiva = conta.ftp_ativo || conta.sync_ativo;
      result.push({
        id: `vv-${conta.id}`,
        type: 'via_verde',
        nome: conta.nome_conta,
        ativo: contaActiva,
        ultimoSync: null,
        username: conta.ftp_utilizador,
        password: conta.ftp_password,
        connectionMode: 'ftp',
        subLabel: `${conta.ftp_protocolo.toUpperCase()} · RAC: ${conta.codigo_rac}`,
        rawData: conta,
        logoUrl: conta.logo_url,
      });
    });

    // Cartrack — API REST directa (GPS/frota). Card com botão Play → cartrack-sync.
    integracoes
      .filter((i) => i.plataforma === 'cartrack')
      .forEach((i) => {
        result.push({
          id: i.id,
          type: 'cartrack',
          nome: i.nome,
          ativo: i.ativo,
          ultimoSync: i.ultimo_sync,
          username: i.client_id,
          password: i.client_secret,
          connectionMode: 'api',
          rawData: i,
          logoUrl: i.logo_url || '/images/logo-cartrack.png',
        });
      });

    // Brevo (email) — integração da própria empresa (plataforma='email', email_provider='brevo')
    integracoes
      .filter((i) => i.plataforma === 'email')
      .forEach((i) => {
        result.push({
          id: i.id,
          type: 'email',
          nome: i.nome,
          ativo: i.ativo,
          ultimoSync: null,
          username: i.email_sender_email ?? null,
          password: null,
          connectionMode: 'api',
          subLabel: i.email_sender_email ?? undefined,
          rawData: i,
          logoUrl: null,
        });
      });

    // Faturação fiscal (KeyInvoice, etc.) — igual às restantes plataformas:
    // só aparece na grelha depois de configurada, via "Adicionar Plataforma".
    const fatRow = (integracoes as any[]).find((i) => i.plataforma === 'faturacao') || null;
    if (fatRow) {
      result.push({
        id: fatRow.id,
        type: 'faturacao',
        nome: 'Faturação',
        ativo: !!fatRow.ativo,
        ultimoSync: null,
        username: null,
        password: null,
        connectionMode: 'api',
        subLabel: faturacaoProviderLabel(fatRow.config?.provider),
        rawData: fatRow,
        logoUrl: null,
      });
    }

    setCards(result);
  };

  // Card handlers
  const handleCardEdit = (card: IntegracaoCardData) => {
    if (card.type === 'faturacao') {
      setFaturacaoRow((card.rawData as FaturacaoConfigRow | null) ?? null);
      setFaturacaoDialogOpen(true);
    } else if (card.type === 'via_verde') {
      // Distinguir: rawData é ViaVerdeConta (legado FTP) OU IntegracaoConfig (novo wizard via_verde).
      // Integração nova (com robot Apify) → abrir IntegracaoDetailModal.
      // Conta antiga (FTP/sync) → abrir ViaVerdeContaDialog.
      const raw = card.rawData as { integracao_id?: string } | null | undefined;
      const isContaLegada =
        !!raw && typeof raw === 'object' && 'integracao_id' in raw && !('plataforma' in raw);
      if (isContaLegada) {
        setSelectedViaVerdeConta(raw as ViaVerdeConta);
        setViaVerdeDialogOpen(true);
      } else {
        setSelectedIntegracao(card.rawData as IntegracaoConfig);
        setDetailModalOpen(true);
      }
    } else if (card.type === 'email') {
      setEditEmailRow(card.rawData as EmailIntegracaoRow);
      setEditEmailDialogOpen(true);
    } else {
      const integracao = card.rawData as IntegracaoConfig;
      setSelectedIntegracao(integracao);
      setDetailModalOpen(true);
    }
  };

  const handleCardSync = (card: IntegracaoCardData) => {
    if (card.type === 'via_verde') return;
    const integracao = card.rawData as IntegracaoConfig;
    setSelectedIntegracao(integracao);
    setDetailModalOpen(true);
  };

  const handleIntegracaoUpdated = (updatedIntegracao?: IntegracaoConfig) => {
    // Rehydrate the selectedIntegracao immediately so the modal shows fresh data
    if (updatedIntegracao) {
      setSelectedIntegracao(updatedIntegracao);
    }
    fetchAll();
  };

  const handleCardImport = (card: IntegracaoCardData) => {
    const integracao = card.rawData as IntegracaoConfig;
    if (integracao.plataforma === 'uber') {
      setSelectedUberIntegracaoId(integracao.id);
      setImportUberDialogOpen(true);
    } else {
      setSelectedRobotIntegracaoId(integracao.id);
      setImportRobotDialogOpen(true);
    }
  };

  const handleDelete = (card: IntegracaoCardData) => {
    setSelectedDeleteCard(card);
    setDeleteIntegracaoDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedDeleteCard) return;
    try {
      const isVvConta = selectedDeleteCard.id.startsWith('vv-');
      if (isVvConta) {
        const contaId = selectedDeleteCard.id.slice(3);
        const { error } = await (supabase as any)
          .from('via_verde_contas')
          .delete()
          .eq('id', contaId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('plataformas_configuracao')
          .delete()
          .eq('id', selectedDeleteCard.id);
        if (error) throw error;
      }
      toast({ title: 'Integração eliminada.' });
      setDeleteIntegracaoDialogOpen(false);
      setSelectedDeleteCard(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleExecuteRobot = async (card: IntegracaoCardData) => {
    const integracao = card.rawData as IntegracaoConfig;
    const id = integracao.id;
    setExecutingRobots((prev) => new Set(prev).add(id));
    try {
      const { data, error } = await supabase.functions.invoke('robot-execute', {
        body: { integracao_id: id },
      });
      if (error) {
        let msg = error.message;
        try {
          const body = await error.context?.json?.();
          msg = body?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Erro desconhecido');
      toast({ title: 'Robot iniciado', description: `Run ID: ${data.run_id}` });
    } catch (error: any) {
      toast({
        title: 'Erro ao executar robot',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setExecutingRobots((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleExecuteCartrack = async (card: IntegracaoCardData) => {
    const integracao = card.rawData as IntegracaoConfig;
    const id = integracao.id;
    setExecutingRobots((prev) => new Set(prev).add(id));
    try {
      const { data, error } = await supabase.functions.invoke('cartrack-sync', {
        body: { integracao_id: id },
      });
      if (error) {
        let msg = error.message;
        try {
          const body = await error.context?.json?.();
          msg = body?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Erro desconhecido');
      const v = data.vehicles || {};
      toast({
        title: 'Cartrack sincronizada',
        description: `${v.upserted ?? 0} viaturas (${v.matched ?? 0} ligadas, ${v.km_atualizado ?? 0} km atualizados) · ${data.trips?.upserted ?? 0} viagens · ${data.events?.upserted ?? 0} eventos.`,
      });
      fetchAll();
    } catch (error: any) {
      toast({
        title: 'Erro ao sincronizar Cartrack',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setExecutingRobots((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleExecuteUber = async (card: IntegracaoCardData) => {
    const integracao = card.rawData as IntegracaoConfig;
    const id = integracao.id;
    setExecutingRobots((prev) => new Set(prev).add(id));
    try {
      const { data, error } = await supabase.functions.invoke('uber-sync', {
        body: { integracao_id: id },
      });
      if (error) {
        let msg = error.message;
        try {
          const body = await error.context?.json?.();
          msg = body?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Erro desconhecido');
      toast({
        title: 'Uber — Webhook activo',
        description: data.message || 'Dados chegam automaticamente via webhook.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao verificar Uber',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setExecutingRobots((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Webhook handlers (kept from original)
  const handleOpenWebhookDialog = (webhook?: IntegracaoWebhook) => {
    if (webhook) {
      setSelectedWebhook(webhook);
      setWebhookFormData({
        nome: webhook.nome,
        descricao: webhook.descricao || '',
        url: webhook.url,
        evento: webhook.evento,
        ativo: webhook.ativo,
      });
    } else {
      setSelectedWebhook(null);
      setWebhookFormData({ nome: '', descricao: '', url: '', evento: '', ativo: true });
    }
    setWebhookDialogOpen(true);
  };

  const handleSaveWebhook = async () => {
    if (!webhookFormData.nome || !webhookFormData.url || !webhookFormData.evento) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    try {
      new URL(webhookFormData.url);
    } catch {
      toast({ title: 'Erro', description: 'URL inválida.', variant: 'destructive' });
      return;
    }

    try {
      setSavingWebhook(true);
      if (selectedWebhook) {
        const { error } = await supabase
          .from('integracoes_webhooks')
          .update({
            nome: webhookFormData.nome,
            descricao: webhookFormData.descricao || null,
            url: webhookFormData.url,
            evento: webhookFormData.evento,
            ativo: webhookFormData.ativo,
          })
          .eq('id', selectedWebhook.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Webhook atualizado.' });
      } else {
        const { error } = await supabase.from('integracoes_webhooks').insert({
          nome: webhookFormData.nome,
          descricao: webhookFormData.descricao || null,
          url: webhookFormData.url,
          evento: webhookFormData.evento,
          ativo: webhookFormData.ativo,
        });
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Webhook criado.' });
      }
      setWebhookDialogOpen(false);
      fetchAll();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível guardar o webhook.',
        variant: 'destructive',
      });
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!selectedWebhook) return;
    try {
      const { error } = await supabase
        .from('integracoes_webhooks')
        .delete()
        .eq('id', selectedWebhook.id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Webhook eliminado.' });
      setDeleteWebhookDialogOpen(false);
      setSelectedWebhook(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleWebhookActive = async (webhook: IntegracaoWebhook) => {
    try {
      const { error } = await supabase
        .from('integracoes_webhooks')
        .update({ ativo: !webhook.ativo })
        .eq('id', webhook.id);
      if (error) throw error;
      setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? { ...w, ativo: !w.ativo } : w)));
      toast({
        title: 'Sucesso',
        description: `Webhook ${!webhook.ativo ? 'ativado' : 'desativado'}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o estado.',
        variant: 'destructive',
      });
    }
  };

  const handleTestWebhook = async (webhook: IntegracaoWebhook) => {
    try {
      setTestingWebhook(webhook.id);
      const { data, error } = await supabase.functions.invoke('send-webhook', {
        body: {
          evento: webhook.evento,
          dados: {
            teste: true,
            mensagem: 'Este é um teste do webhook',
            webhook_nome: webhook.nome,
            timestamp: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      const resultado = data?.resultados?.find((r: any) => r.webhook === webhook.nome);
      if (resultado?.success) {
        toast({
          title: 'Teste bem sucedido',
          description: `O webhook "${webhook.nome}" respondeu corretamente.`,
        });
      } else {
        toast({
          title: 'Teste falhou',
          description: resultado?.error || 'Não respondeu corretamente.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setTestingWebhook(null);
    }
  };

  const getEventoLabel = (evento: string) =>
    EVENTOS_DISPONIVEIS.find((e) => e.value === evento)?.label || evento;

  const sortedWebhooks = React.useMemo(() => {
    const list = [...webhooks];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (webhookSortField === 'nome') {
        va = a.nome;
        vb = b.nome;
      } else if (webhookSortField === 'evento') {
        va = getEventoLabel(a.evento);
        vb = getEventoLabel(b.evento);
      } else if (webhookSortField === 'url') {
        va = a.url;
        vb = b.url;
      }
      if (va < vb) return webhookSortDir === 'asc' ? -1 : 1;
      if (va > vb) return webhookSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [webhooks, webhookSortField, webhookSortDir]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Integrações</h2>
          <p className="text-sm text-muted-foreground">Gerir plataformas, contas e webhooks</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchAll}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setNewIntegracaoDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar plataforma
          </Button>
        </div>
      </div>

      {/* Cards Grid */}
      {cards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Settings className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p>Nenhuma integração configurada.</p>
          <p className="text-sm mt-1">Clique em "Adicionar plataforma" para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => {
            const rawPlataforma = (card.rawData as IntegracaoConfig)?.plataforma;
            const isRobotBacked = rawPlataforma === 'robot' || rawPlataforma === 'via_verde';
            const isUberBacked = rawPlataforma === 'uber';
            const isCartrackBacked = rawPlataforma === 'cartrack';
            const hasImport = rawPlataforma === 'robot' || isUberBacked;
            return (
              <IntegracaoCard
                key={card.id}
                data={card}
                onEdit={handleCardEdit}
                onSync={
                  card.type !== 'via_verde' &&
                  card.type !== 'faturacao' &&
                  card.type !== 'email' &&
                  card.type !== 'cartrack'
                    ? handleCardSync
                    : undefined
                }
                onImport={hasImport ? handleCardImport : undefined}
                onExecute={
                  isRobotBacked
                    ? handleExecuteRobot
                    : isUberBacked
                      ? handleExecuteUber
                      : isCartrackBacked
                        ? handleExecuteCartrack
                        : undefined
                }
                onDelete={handleDelete}
                isExecuting={executingRobots.has(card.id)}
              />
            );
          })}
        </div>
      )}

      <Separator />

      {/* Webhooks Section */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Webhook className="h-5 w-5" />
                Webhooks
              </CardTitle>
              <CardDescription>
                Integrar com sistemas externos como n8n, Zapier, etc.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => handleOpenWebhookDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Webhook className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum webhook configurado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="nome"
                    sortField={webhookSortField}
                    sortDir={webhookSortDir}
                    onSort={handleWebhookSort}
                  >
                    Nome
                  </SortableTableHead>
                  <SortableTableHead
                    field="evento"
                    sortField={webhookSortField}
                    sortDir={webhookSortDir}
                    onSort={handleWebhookSort}
                  >
                    Evento
                  </SortableTableHead>
                  <SortableTableHead
                    field="url"
                    sortField={webhookSortField}
                    sortDir={webhookSortDir}
                    onSort={handleWebhookSort}
                  >
                    URL
                  </SortableTableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWebhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{webhook.nome}</p>
                        {webhook.descricao && (
                          <p className="text-sm text-muted-foreground">{webhook.descricao}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getEventoLabel(webhook.evento)}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate block">
                        {webhook.url}
                      </code>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={webhook.ativo}
                        onCheckedChange={() => handleToggleWebhookActive(webhook)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTestWebhook(webhook)}
                          disabled={!webhook.ativo || testingWebhook === webhook.id}
                        >
                          {testingWebhook === webhook.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenWebhookDialog(webhook)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedWebhook(webhook);
                            setDeleteWebhookDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <IntegracaoDialog
        open={newIntegracaoDialogOpen}
        onOpenChange={setNewIntegracaoDialogOpen}
        onSuccess={fetchAll}
        onOpenFaturacao={() => {
          setFaturacaoRow(null);
          setFaturacaoDialogOpen(true);
        }}
      />

      {selectedIntegracao && (
        <IntegracaoDetailModal
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          integracao={selectedIntegracao}
          onUpdate={handleIntegracaoUpdated}
        />
      )}

      {viaVerdeIntegracaoId && (
        <ViaVerdeContaDialog
          open={viaVerdeDialogOpen}
          onOpenChange={setViaVerdeDialogOpen}
          integracaoId={viaVerdeIntegracaoId}
          conta={selectedViaVerdeConta}
          onSuccess={fetchAll}
        />
      )}

      <FaturacaoIntegracaoDialog
        open={faturacaoDialogOpen}
        onOpenChange={setFaturacaoDialogOpen}
        row={faturacaoRow}
        onSuccess={fetchAll}
      />

      <EditarIntegracaoEmailDialog
        open={editEmailDialogOpen}
        onOpenChange={setEditEmailDialogOpen}
        row={editEmailRow}
        onSuccess={fetchAll}
      />

      {/* Webhook Create/Edit Dialog */}
      <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedWebhook ? 'Editar Webhook' : 'Novo Webhook'}</DialogTitle>
            <DialogDescription>Configure os detalhes do webhook.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wh-nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wh-nome"
                placeholder="Ex: n8n Tickets"
                value={webhookFormData.nome}
                onChange={(e) => setWebhookFormData((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-descricao">Descrição</Label>
              <Textarea
                id="wh-descricao"
                placeholder="Descrição opcional..."
                value={webhookFormData.descricao}
                onChange={(e) =>
                  setWebhookFormData((prev) => ({ ...prev, descricao: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-url">
                URL do Webhook <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wh-url"
                type="url"
                placeholder="https://..."
                value={webhookFormData.url}
                onChange={(e) => setWebhookFormData((prev) => ({ ...prev, url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-evento">
                Evento <span className="text-destructive">*</span>
              </Label>
              <Select
                value={webhookFormData.evento}
                onValueChange={(value) =>
                  setWebhookFormData((prev) => ({ ...prev, evento: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o evento" />
                </SelectTrigger>
                <SelectContent>
                  {EVENTOS_DISPONIVEIS.map((evento) => (
                    <SelectItem key={evento.value} value={evento.value}>
                      <div>
                        <p>{evento.label}</p>
                        <p className="text-xs text-muted-foreground">{evento.description}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wh-ativo">Webhook Ativo</Label>
              <Switch
                id="wh-ativo"
                checked={webhookFormData.ativo}
                onCheckedChange={(checked) =>
                  setWebhookFormData((prev) => ({ ...prev, ativo: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWebhookDialogOpen(false)}
              disabled={savingWebhook}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveWebhook} disabled={savingWebhook}>
              {savingWebhook && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedWebhook ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Webhook Dialog */}
      <AlertDialog open={deleteWebhookDialogOpen} onOpenChange={setDeleteWebhookDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja eliminar o webhook "{selectedWebhook?.nome}"? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWebhook}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Integration Confirmation */}
      <AlertDialog open={deleteIntegracaoDialogOpen} onOpenChange={setDeleteIntegracaoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar integração</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja eliminar "{selectedDeleteCard?.nome}"? Todos os dados
              associados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedDeleteCard(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Robot CSV Dialog */}
      <ImportRobotCsvDialog
        open={importRobotDialogOpen}
        onOpenChange={setImportRobotDialogOpen}
        integracaoId={selectedRobotIntegracaoId}
        onImportComplete={fetchAll}
      />

      {/* Import Uber CSV Dialog */}
      <ImportUberCsvDialog
        open={importUberDialogOpen}
        onOpenChange={setImportUberDialogOpen}
        integracaoId={selectedUberIntegracaoId}
        onImportComplete={fetchAll}
      />
    </div>
  );
};
