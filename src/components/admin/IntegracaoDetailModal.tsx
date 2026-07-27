import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SINCRONIZACAO_ATIVA } from '@/config/sync';
import { useOrgId } from '@/contexts/TenantContext';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { cronExpressionToPreset, presetToCronExpression, CRON_PRESETS } from '@/lib/cronPresets';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bot,
  Car,
  Clock,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  MapPin,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
  Fuel,
  Zap,
} from 'lucide-react';
import type { IntegracaoConfig } from './integracoes/types';

// Sync automático do Via Verde: janela fixa Segunda 00:00–05:00 (Lisboa).
// Fora desta janela os dados podem não estar prontos até às 7h de Segunda
// (exigência de negócio), e horas de Domingo fazem o cálculo de "semana
// anterior" em robot-execute contar uma semana a mais (assume dow=1).
const VIA_VERDE_SYNC_DIA_SEMANA = 1; // Segunda-feira, fixo
const VIA_VERDE_SYNC_HORAS = [0, 1, 2, 3, 4, 5];
const clampViaVerdeSyncHora = (h: number | null | undefined) =>
  VIA_VERDE_SYNC_HORAS.includes(h ?? -1) ? (h as number) : 4;

interface IntegracaoDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integracao: IntegracaoConfig;
  onUpdate: (integracao?: IntegracaoConfig) => void;
}

export const IntegracaoDetailModal: React.FC<IntegracaoDetailModalProps> = ({
  open,
  onOpenChange,
  integracao,
  onUpdate,
}) => {
  const { toast } = useToast();
  const orgId = useOrgId();
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(integracao.logo_url ?? null);

  const [executingRobot, setExecutingRobot] = useState(false);
  const [loadingCron, setLoadingCron] = useState(false);

  const initialCronRef = useRef<{ schedule: string; custom: string }>({
    schedule: 'disabled',
    custom: '',
  });

  // Determine if this is a simplified integration (robot with known target)
  const isUberSimplified =
    integracao.plataforma === 'robot' && integracao.robot_target_platform === 'uber';
  const isBoltSimplified =
    integracao.plataforma === 'robot' && integracao.robot_target_platform === 'bolt';
  const isBpSimplified =
    integracao.plataforma === 'robot' && integracao.robot_target_platform === 'bp';
  const isRepsolSimplified =
    integracao.plataforma === 'robot' && integracao.robot_target_platform === 'repsol';
  const isEdpSimplified =
    integracao.plataforma === 'robot' && integracao.robot_target_platform === 'edp';
  const isViaVerde = integracao.plataforma === 'via_verde';
  // Cartrack: API REST directa (GPS/frota). Layout simplificado (username/password),
  // sincroniza pelo botão abaixo → cartrack-sync.
  const isCartrack = integracao.plataforma === 'cartrack';
  const isSimplified =
    isUberSimplified ||
    isBoltSimplified ||
    isBpSimplified ||
    isRepsolSimplified ||
    isEdpSimplified ||
    isViaVerde ||
    isCartrack;

  const displayIcon = isUberSimplified
    ? Car
    : isBoltSimplified
      ? Zap
      : isBpSimplified
        ? Fuel
        : isRepsolSimplified
          ? Fuel
          : isEdpSimplified
            ? Zap
            : isCartrack
              ? MapPin
              : integracao.plataforma === 'bolt'
                ? Zap
                : integracao.plataforma === 'robot'
                  ? Bot
                  : Car;
  const displayLabel = isUberSimplified
    ? 'Uber'
    : isBoltSimplified
      ? 'Bolt'
      : isBpSimplified
        ? 'BP'
        : isRepsolSimplified
          ? 'Repsol'
          : isEdpSimplified
            ? 'EDP'
            : isViaVerde
              ? 'Via Verde'
              : isCartrack
                ? 'Cartrack'
                : integracao.plataforma === 'bolt'
                  ? 'Bolt'
                  : integracao.plataforma === 'robot'
                    ? 'Robot (Apify)'
                    : 'Uber';

  const [formData, setFormData] = useState({
    nome: integracao.nome,
    client_id: integracao.client_id ?? '',
    client_secret: integracao.client_secret ?? '',
    webhook_signing_key: integracao.webhook_signing_key ?? '',
    uber_scopes: (integracao.uber_scopes ?? []).join(' '),
    company_id: integracao.company_id?.toString() || '',
    ativo: integracao.ativo,
    // Cartrack é automático por defeito: null conta como ligado (alinhado com
    // cartrack-scheduled-sync, que sincroniza quando sync_automatico !== false).
    sync_automatico: integracao.sync_automatico ?? integracao.plataforma === 'cartrack',
    intervalo_sync_horas: integracao.intervalo_sync_horas ?? 24,
    site_url: integracao.webhook_url ?? '',
    apify_actor_id: integracao.apify_actor_id ?? '',
    apify_api_token: integracao.apify_api_token ?? '',
    auth_mode: (integracao.auth_mode ?? 'password') as 'password' | 'cookies',
    cookies_json: integracao.cookies_json ?? '',
    cron_schedule: 'disabled' as string,
    cron_custom: '',
    robot_target_platform: (integracao.robot_target_platform ?? 'uber') as 'bolt' | 'uber' | 'bp',
    sync_dia_semana: VIA_VERDE_SYNC_DIA_SEMANA,
    sync_hora: clampViaVerdeSyncHora(integracao.sync_hora),
  });

  // Período do robô ao clicar "Executar Robot" — escolha por-execução, não é
  // gravado na integração (o sync automático usa sempre "semana anterior",
  // calculado dinamicamente dentro do robot-execute).
  const [periodoTipo, setPeriodoTipo] = useState<'semana_anterior' | 'personalizado'>(
    'semana_anterior'
  );
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  // Load real cron state from pg_cron when modal opens
  const loadCronState = async () => {
    if (integracao.plataforma !== 'robot') return;
    try {
      setLoadingCron(true);
      const { data, error } = await supabase.functions.invoke('robot-schedule', {
        body: { integracao_id: integracao.id, action: 'read' },
      });
      if (!error && data?.exists && data?.cron_expression) {
        const preset = cronExpressionToPreset(data.cron_expression);
        const customVal = preset === 'custom' ? data.cron_expression : '';
        setFormData((prev) => ({ ...prev, cron_schedule: preset, cron_custom: customVal }));
        initialCronRef.current = { schedule: preset, custom: customVal };
      } else {
        setFormData((prev) => ({ ...prev, cron_schedule: 'disabled', cron_custom: '' }));
        initialCronRef.current = { schedule: 'disabled', custom: '' };
      }
    } catch (err) {
      console.warn('Erro ao ler cron state:', err);
      initialCronRef.current = { schedule: 'disabled', custom: '' };
    } finally {
      setLoadingCron(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLogoUrl(integracao.logo_url ?? null);
    setFormData({
      nome: integracao.nome,
      client_id: integracao.client_id ?? '',
      client_secret: integracao.client_secret ?? '',
      webhook_signing_key: integracao.webhook_signing_key ?? '',
      uber_scopes: (integracao.uber_scopes ?? []).join(' '),
      company_id: integracao.company_id?.toString() || '',
      ativo: integracao.ativo,
      // Cartrack é automático por defeito: null conta como ligado (alinhado com
      // cartrack-scheduled-sync, que sincroniza quando sync_automatico !== false).
      sync_automatico: integracao.sync_automatico ?? integracao.plataforma === 'cartrack',
      intervalo_sync_horas: integracao.intervalo_sync_horas ?? 24,
      site_url: integracao.plataforma === 'robot' ? (integracao.webhook_url ?? '') : '',
      apify_actor_id: integracao.apify_actor_id ?? '',
      apify_api_token: integracao.apify_api_token ?? '',
      auth_mode: (integracao.auth_mode ?? 'password') as 'password' | 'cookies',
      cookies_json: integracao.cookies_json ?? '',
      cron_schedule: 'disabled',
      cron_custom: '',
      robot_target_platform: (integracao.robot_target_platform ?? 'uber') as 'bolt' | 'uber' | 'bp',
      sync_dia_semana: integracao.sync_dia_semana ?? 1,
      sync_hora: integracao.sync_hora ?? 4,
    });
    setPeriodoTipo('semana_anterior');
    setPeriodoInicio('');
    setPeriodoFim('');
    loadCronState();
  }, [open, integracao]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Ficheiro muito grande', description: 'Máximo 2MB.', variant: 'destructive' });
      return;
    }
    try {
      setUploadingLogo(true);
      const ext = file.name.split('.').pop();
      const path = `${integracao.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('integracoes-logos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from('integracoes-logos').getPublicUrl(path);
      setLogoUrl(publicUrl);
      toast({ title: 'Logo carregado' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => setLogoUrl(null);

  const handleTestConnection = async () => {
    if (integracao.plataforma !== 'bolt') return;
    try {
      const [testing, setTestingLocal] = [true, () => {}];
      const { data, error } = await supabase.functions.invoke('bolt-test-connection', {
        body: {
          client_id: formData.client_id,
          client_secret: formData.client_secret,
          company_id: formData.company_id,
          integracao_id: integracao.id,
        },
      });
      if (error) throw error;
      if (data.success) {
        toast({
          title: 'Bolt validada',
          description: data.message || data.company?.company_name || 'Configuração válida',
        });
      } else {
        toast({
          title: 'Falha na validação',
          description: data.error || 'Verifique a configuração',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível validar',
        variant: 'destructive',
      });
    }
  };

  const handleExecuteRobot = async () => {
    if (periodoTipo === 'personalizado' && (!periodoInicio || !periodoFim)) {
      toast({ title: 'Preencha as duas datas do período personalizado', variant: 'destructive' });
      return;
    }
    try {
      setExecutingRobot(true);

      // Via Verde: passa pela fila (via_verde_sync_queue) tal como o sync
      // automático — evita que um disparo manual ultrapasse o limite de
      // concorrência do plano Apify dedicado, ou entre em conflito com uma
      // execução já agendada da mesma integração. via-verde-sync-drain é
      // invocado de seguida para processar já, sem esperar pelo próximo
      // tick de 5 min.
      if (isViaVerde) {
        const { error: insertError } = await (supabase as any).from('via_verde_sync_queue').insert({
          integracao_id: integracao.id,
          org_id: orgId,
          status: 'pending',
          periodo_inicio: periodoTipo === 'personalizado' ? periodoInicio : null,
          periodo_fim: periodoTipo === 'personalizado' ? periodoFim : null,
        });

        if (insertError && insertError.code !== '23505') {
          throw new Error(insertError.message);
        }

        toast({
          title: insertError ? 'Já estava na fila' : 'Adicionado à fila',
          description: insertError
            ? 'Esta integração já tem uma execução pendente ou em curso.'
            : 'A processar em breve — respeitando o limite de execuções em simultâneo.',
        });

        await supabase.functions.invoke('via-verde-sync-drain', { body: {} });
        return;
      }

      const body: Record<string, unknown> = { integracao_id: integracao.id };
      if (periodoTipo === 'personalizado') {
        body.periodo_inicio = periodoInicio;
        body.periodo_fim = periodoFim;
      }
      const { data, error } = await supabase.functions.invoke('robot-execute', { body });
      if (error) {
        let msg = error.message;
        try {
          const body = await error.context?.json?.();
          msg = body?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      if (data?.success) {
        toast({ title: 'Robot iniciado', description: `Run ID: ${data.run_id || 'em execução'}` });
      } else {
        toast({
          title: 'Erro ao executar',
          description: data?.error || 'Não foi possível iniciar',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setExecutingRobot(false);
    }
  };

  const handleSyncCartrack = async () => {
    try {
      setExecutingRobot(true);
      const body: Record<string, unknown> = { integracao_id: integracao.id };
      if (periodoTipo === 'personalizado' && periodoInicio && periodoFim) {
        body.date_from = periodoInicio;
        body.date_to = periodoFim;
      }
      const { data, error } = await supabase.functions.invoke('cartrack-sync', { body });
      if (error) {
        let msg = error.message;
        try {
          const b = await error.context?.json?.();
          msg = b?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Não foi possível sincronizar');
      const v = data.vehicles || {};
      toast({
        title: 'Cartrack sincronizada',
        description: `${v.upserted ?? 0} viaturas (${v.matched ?? 0} ligadas, ${v.km_atualizado ?? 0} km atualizados) · ${data.trips?.upserted ?? 0} viagens · ${data.events?.upserted ?? 0} eventos.`,
      });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setExecutingRobot(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updatePayload: Record<string, any> = {
        nome: formData.nome,
        ativo: formData.ativo,
        logo_url: logoUrl,
      };

      if (
        isUberSimplified ||
        isBoltSimplified ||
        isBpSimplified ||
        isRepsolSimplified ||
        isEdpSimplified ||
        isViaVerde
      ) {
        updatePayload.client_id = formData.client_id || null;
        updatePayload.client_secret = formData.client_secret || null;
        updatePayload.cookies_json = null;
        updatePayload.auth_mode = 'password';
        if (isViaVerde) {
          updatePayload.sync_automatico = formData.sync_automatico;
          // Fixo — janela Segunda 00:00-05:00 (ver constante no topo do
          // ficheiro). Não confiar em formData aqui: garante que mesmo uma
          // integração antiga com dia/hora fora da janela fica corrigida
          // ao gravar, independentemente do que o Select mostrava.
          updatePayload.sync_dia_semana = VIA_VERDE_SYNC_DIA_SEMANA;
          updatePayload.sync_hora = clampViaVerdeSyncHora(formData.sync_hora);
        }
      } else if (isCartrack) {
        updatePayload.client_id = formData.client_id || null;
        updatePayload.client_secret = formData.client_secret || null;
        updatePayload.sync_automatico = formData.sync_automatico;
      } else if (integracao.plataforma === 'uber') {
        // Native Uber integration (webhook + direct API)
        updatePayload.client_id = formData.client_id || null;
        updatePayload.client_secret = formData.client_secret || null;
        updatePayload.webhook_signing_key = formData.webhook_signing_key || null;
        updatePayload.uber_scopes = formData.uber_scopes
          ? formData.uber_scopes.trim().split(/\s+/).filter(Boolean)
          : [];
      } else if (integracao.plataforma === 'bolt') {
        updatePayload.client_id = formData.client_id || null;
        updatePayload.client_secret = formData.client_secret || null;
        updatePayload.company_id = formData.company_id ? parseInt(formData.company_id, 10) : null;
        updatePayload.sync_automatico = formData.sync_automatico;
        updatePayload.intervalo_sync_horas = formData.intervalo_sync_horas;
      } else if (integracao.plataforma === 'robot') {
        // Advanced robot
        updatePayload.client_id =
          formData.auth_mode === 'password' ? formData.client_id || null : null;
        updatePayload.client_secret =
          formData.auth_mode === 'password' ? formData.client_secret || null : null;
        updatePayload.webhook_url = formData.site_url || null;
        updatePayload.apify_actor_id = formData.apify_actor_id || null;
        updatePayload.apify_api_token = formData.apify_api_token || null;
        updatePayload.auth_mode = formData.auth_mode;
        updatePayload.cookies_json =
          formData.auth_mode === 'cookies' ? formData.cookies_json || null : null;
        updatePayload.robot_target_platform = formData.robot_target_platform;
      }

      const { data, error } = await supabase
        .from('plataformas_configuracao')
        .update(updatePayload as TablesUpdate<'plataformas_configuracao'>)
        .eq('id', integracao.id)
        .select('*')
        .single();

      if (error) throw error;

      // Via Verde: propagar credenciais + sync_automatico para via_verde_contas,
      // que é de onde o robot-execute lê as credenciais reais.
      if (isViaVerde) {
        const supabaseAny = supabase as any;
        const { data: updatedContas, error: contaErr } = await supabaseAny
          .from('via_verde_contas')
          .update({
            sync_email: formData.client_id || '',
            sync_password: formData.client_secret || '',
            sync_ativo: formData.sync_automatico,
          })
          .eq('integracao_id', integracao.id)
          .select('id');

        // Nenhuma linha existente para este integracao_id (ex: integração antiga
        // criada antes da conta ser auto-gerada) — criar agora, senão o robot-execute
        // fica sem credenciais para ler.
        if (!contaErr && (!updatedContas || updatedContas.length === 0)) {
          const { error: insertErr } = await supabaseAny.from('via_verde_contas').insert({
            integracao_id: integracao.id,
            nome_conta: formData.nome,
            codigo_rac: 'IMPORTAR',
            ftp_host: '',
            ftp_utilizador: '',
            ftp_password: '',
            ftp_ativo: false,
            sync_email: formData.client_id || '',
            sync_password: formData.client_secret || '',
            sync_ativo: formData.sync_automatico,
          });
          if (insertErr) {
            console.error('Erro ao criar via_verde_contas:', insertErr);
            toast({
              title: 'Aviso',
              description:
                'Configuração guardada, mas a conta Via Verde não foi criada. Tente novamente.',
              variant: 'destructive',
            });
          }
        } else if (contaErr) {
          console.error('Erro ao actualizar via_verde_contas:', contaErr);
          toast({
            title: 'Aviso',
            description:
              'Configuração guardada, mas a conta Via Verde pode não ter sido actualizada.',
            variant: 'destructive',
          });
        }
      }

      // Handle cron scheduling for robot integrations
      if (integracao.plataforma === 'robot') {
        const cronChanged =
          formData.cron_schedule !== initialCronRef.current.schedule ||
          (formData.cron_schedule === 'custom' &&
            formData.cron_custom !== initialCronRef.current.custom);

        if (cronChanged) {
          try {
            if (formData.cron_schedule === 'disabled') {
              await supabase.functions.invoke('robot-schedule', {
                body: { integracao_id: integracao.id, action: 'delete' },
              });
            } else {
              const cronExpression = presetToCronExpression(
                formData.cron_schedule,
                formData.cron_custom
              );
              if (cronExpression) {
                await supabase.functions.invoke('robot-schedule', {
                  body: { integracao_id: integracao.id, cron_expression: cronExpression },
                });
              }
            }
            initialCronRef.current = {
              schedule: formData.cron_schedule,
              custom: formData.cron_custom,
            };
          } catch (scheduleErr: any) {
            console.warn('Erro ao configurar agendamento:', scheduleErr);
            toast({
              title: 'Aviso',
              description: 'Integração guardada, mas o agendamento pode não ter sido configurado.',
            });
          }
        }
      }

      // Bolt sync scheduling is handled by the central sync-orchestrator
      // No individual cron jobs needed — just save sync_automatico flag

      toast({ title: 'Sucesso', description: 'Configuração guardada' });
      onUpdate(data as IntegracaoConfig);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const { error } = await supabase
        .from('plataformas_configuracao')
        .delete()
        .eq('id', integracao.id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Integração eliminada' });
      setDeleteDialogOpen(false);
      onOpenChange(false);
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const DisplayIcon = displayIcon;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DisplayIcon className="h-5 w-5" />
              {isSimplified ? `Integração ${displayLabel}` : integracao.nome}
              {isSimplified && (
                <span className="text-muted-foreground font-normal">— {integracao.nome}</span>
              )}
              <Badge variant={integracao.ativo ? 'default' : 'secondary'} className="ml-2">
                {integracao.ativo ? 'Activo' : 'Inactivo'}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {isCartrack
                ? 'Integração Cartrack via API REST. Sincronize manualmente pelo botão abaixo.'
                : isSimplified
                  ? `Integração ${displayLabel} via robot automático. Os dados são importados automaticamente.`
                  : 'Edite a configuração da integração.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Nome da Integração</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>

            {/* Logo Upload — hidden for simplified integrations */}
            {!isSimplified && (
              <div className="space-y-2">
                <Label>Logo / Imagem</Label>
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <div className="relative h-12 w-12 rounded-lg border border-border overflow-hidden bg-muted/40">
                      <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded-lg border border-dashed border-border bg-muted/20 flex items-center justify-center">
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                      />
                      <span className="text-sm text-primary hover:underline">
                        {uploadingLogo
                          ? 'A carregar...'
                          : logoUrl
                            ? 'Alterar imagem'
                            : 'Carregar imagem'}
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground">PNG, JPG. Máx 2MB.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Login + Password — shown for all simplified integrations (Uber/Bolt/BP/Repsol/EDP/Via Verde) */}
            {(isUberSimplified ||
              isBoltSimplified ||
              isBpSimplified ||
              isRepsolSimplified ||
              isEdpSimplified ||
              isViaVerde) && (
              <>
                <div className="space-y-2">
                  <Label>Login (Email)</Label>
                  <Input
                    value={formData.client_id}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, client_id: e.target.value }))
                    }
                    placeholder="email@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formData.client_secret}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, client_secret: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* === CARTRACK FIELDS (username/password Basic Auth) === */}
            {isCartrack && (
              <>
                <div className="space-y-2">
                  <Label>Username (API Cartrack)</Label>
                  <Input
                    value={formData.client_id}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, client_id: e.target.value }))
                    }
                    placeholder="Utilizador da API (Fleetweb › API Settings)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formData.client_secret}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, client_secret: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label>Sync automático (cada 15 min)</Label>
                      <p className="text-sm text-muted-foreground">
                        Atualiza posições, odómetro, viagens e eventos automaticamente.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.sync_automatico}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, sync_automatico: checked }))
                    }
                  />
                </div>
                <div className="space-y-2 rounded-lg border border-border p-4">
                  <Label className="text-xs">Período a sincronizar (viagens/eventos)</Label>
                  <Select
                    value={periodoTipo}
                    onValueChange={(value: 'semana_anterior' | 'personalizado') =>
                      setPeriodoTipo(value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semana_anterior">Últimos 30 dias (predefinido)</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  {periodoTipo === 'personalizado' && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs">De</Label>
                        <Input
                          type="date"
                          value={periodoInicio}
                          onChange={(e) => setPeriodoInicio(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Até</Label>
                        <Input
                          type="date"
                          value={periodoFim}
                          onChange={(e) => setPeriodoFim(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    O estado das viaturas (odómetro, posição) é sempre atualizado por completo. O
                    período aplica-se apenas ao histórico de viagens e eventos.
                  </p>
                </div>
              </>
            )}

            {/* Toggle de sync automático — só Via Verde */}
            {isViaVerde && (
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Sync automático (semanal)</p>
                    <p className="text-xs text-muted-foreground">
                      Activa o robô para correr no dia/hora escolhidos abaixo (Lisboa) e importar a
                      semana anterior (Segunda-Domingo).
                    </p>
                  </div>
                  <Switch
                    checked={formData.sync_automatico}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, sync_automatico: checked }))
                    }
                  />
                </div>

                {formData.sync_automatico && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Dia da semana</Label>
                      <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                        Segunda-feira
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Fixo — os dados de todos os robôs têm de estar prontos até às 7h de Segunda.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Hora (Lisboa)</Label>
                      <Select
                        value={String(formData.sync_hora)}
                        onValueChange={(value) =>
                          setFormData((prev) => ({ ...prev, sync_hora: Number(value) }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VIA_VERDE_SYNC_HORAS.map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, '0')}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === UBER NATIVE FIELDS === */}
            {integracao.plataforma === 'uber' && (
              <>
                <div className="space-y-2">
                  <Label>App ID (Client ID)</Label>
                  <Input
                    value={formData.client_id}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, client_id: e.target.value }))
                    }
                    placeholder="PZMlLbqcMDzxpD8FSDx9rTBTPFMhiygi"
                  />
                  <p className="text-xs text-muted-foreground">
                    App ID da aplicação no painel Uber Developer.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>OAuth Client Secret</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formData.client_secret}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, client_secret: e.target.value }))
                      }
                      placeholder="OAuth Client Secret (para API directa)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Necessário para sincronização directa via API. Diferente do signing key do
                    webhook.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Webhook Signing Key</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formData.webhook_signing_key}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, webhook_signing_key: e.target.value }))
                      }
                      placeholder="Chave HMAC para validar webhooks"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Chave para validar assinaturas HMAC dos eventos webhook da Uber.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>OAuth Scopes (API directa)</Label>
                  <Input
                    value={formData.uber_scopes}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, uber_scopes: e.target.value }))
                    }
                    placeholder="partner.trips fleet.trips (separados por espaço)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Scopes OAuth configurados na app Uber Developer, separados por espaço.
                  </p>
                </div>
              </>
            )}

            {/* === BOLT FIELDS === */}
            {integracao.plataforma === 'bolt' && (
              <>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input
                      value={formData.client_id}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, client_id: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company ID</Label>
                    <Input
                      type="number"
                      value={formData.company_id}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, company_id: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formData.client_secret}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, client_secret: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* === ADVANCED ROBOT FIELDS (non-simplified) === */}
            {integracao.plataforma === 'robot' && !isSimplified && (
              <>
                <div className="space-y-2">
                  <Label>Plataforma Alvo</Label>
                  <Select
                    value={formData.robot_target_platform}
                    onValueChange={(value: 'bolt' | 'uber') =>
                      setFormData((prev) => ({ ...prev, robot_target_platform: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bolt">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4" /> Bolt
                        </div>
                      </SelectItem>
                      <SelectItem value="uber">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4" /> Uber
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>URL do Site</Label>
                  <Input
                    value={formData.site_url}
                    onChange={(e) => setFormData((prev) => ({ ...prev, site_url: e.target.value }))}
                    placeholder="https://portal.exemplo.pt"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Modo de Autenticação</Label>
                  <Select
                    value={formData.auth_mode}
                    onValueChange={(value: 'password' | 'cookies') =>
                      setFormData((prev) => ({ ...prev, auth_mode: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="password">Login + Password</SelectItem>
                      <SelectItem value="cookies">Cookies (JSON)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.auth_mode === 'password' && (
                  <>
                    <div className="space-y-2">
                      <Label>Login do Site</Label>
                      <Input
                        value={formData.client_id}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, client_id: e.target.value }))
                        }
                        placeholder="Nome de utilizador ou email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password do Site</Label>
                      <div className="relative">
                        <Input
                          type={showSecret ? 'text' : 'password'}
                          value={formData.client_secret}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, client_secret: e.target.value }))
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                          onClick={() => setShowSecret(!showSecret)}
                        >
                          {showSecret ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>API Token (Apify)</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formData.apify_api_token}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, apify_api_token: e.target.value }))
                      }
                      placeholder="apify_api_..."
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Actor ID (Apify)</Label>
                  <Input
                    value={formData.apify_actor_id}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, apify_actor_id: e.target.value }))
                    }
                    placeholder="apify/web-scraper"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Callback URL (para o actor)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/robot-webhook?integracao_id=${integracao.id}`;
                        try {
                          await navigator.clipboard.writeText(callbackUrl);
                          toast({ title: 'URL copiada' });
                        } catch {
                          toast({
                            title: 'Erro',
                            description: 'Não foi possível copiar.',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copiar URL
                    </Button>
                  </div>
                  <Input
                    value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/robot-webhook?integracao_id=${integracao.id}`}
                    readOnly
                  />
                  <p className="text-sm text-muted-foreground">
                    Configure este URL no actor Apify para receber os resultados automaticamente.
                  </p>
                </div>
              </>
            )}

            {/* Sync semanal toggle for all robot types */}
            {integracao.plataforma === 'robot' && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Sincronização Semanal</Label>
                    <p className="text-sm text-muted-foreground">
                      Segundas-feiras às 00:00 (hora de Lisboa)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.cron_schedule === 'weekly'}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      cron_schedule: checked ? 'weekly' : 'disabled',
                      cron_custom: '',
                    }))
                  }
                />
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
              <div>
                <Label>Integração Activa</Label>
                <p className="text-sm text-muted-foreground">
                  Activa a sincronização de dados desta plataforma.
                </p>
              </div>
              <Switch
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, ativo: checked }))}
              />
            </div>

            {/* Bolt sync toggle */}
            {integracao.plataforma === 'bolt' && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Sincronização Semanal</Label>
                    <p className="text-sm text-muted-foreground">
                      Segundas-feiras às 00:00 (hora de Lisboa)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.sync_automatico}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, sync_automatico: checked }))
                  }
                />
              </div>
            )}

            {/* Período a filtrar na próxima execução manual — só Via Verde.
                O sync automático (toggle acima) usa sempre "semana anterior",
                calculado no momento em que corre; isto é só para o Play. */}
            {isViaVerde && (
              <div className="space-y-2 rounded-lg border border-border p-4">
                <Label className="text-xs">Período a filtrar (Executar Robot)</Label>
                <Select
                  value={periodoTipo}
                  onValueChange={(value: 'semana_anterior' | 'personalizado') =>
                    setPeriodoTipo(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semana_anterior">
                      Semana anterior (Segunda-Domingo)
                    </SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {periodoTipo === 'personalizado' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs">De</Label>
                      <Input
                        type="date"
                        value={periodoInicio}
                        onChange={(e) => setPeriodoInicio(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Até</Label>
                      <Input
                        type="date"
                        value={periodoFim}
                        onChange={(e) => setPeriodoFim(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {integracao.plataforma === 'bolt' && (
                <Button variant="outline" onClick={handleTestConnection}>
                  <Zap className="mr-2 h-4 w-4" /> Testar Conexão
                </Button>
              )}
              {(SINCRONIZACAO_ATIVA ||
                integracao.plataforma === 'via_verde' ||
                integracao.robot_target_platform === 'bolt') &&
                (integracao.plataforma === 'robot' || integracao.plataforma === 'via_verde') && (
                  <Button variant="outline" onClick={handleExecuteRobot} disabled={executingRobot}>
                    {executingRobot ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Executar Robot
                  </Button>
                )}
              {isCartrack && (
                <Button variant="outline" onClick={handleSyncCartrack} disabled={executingRobot}>
                  {executingRobot ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sincronizar
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar
              </Button>
              <Button
                variant="destructive"
                className="ml-auto"
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => setDeleteDialogOpen(true), 150);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) onOpenChange(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar integração?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção é irreversível. Todos os dados associados serão eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
