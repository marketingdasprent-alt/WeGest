import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Eye,
  EyeOff,
  Clock,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronRight,
} from 'lucide-react';
import {
  UBER_DEFAULTS,
  BOLT_DEFAULTS,
  BP_DEFAULTS,
  REPSOL_DEFAULTS,
  EDP_DEFAULTS,
  VIAVERDE_DEFAULTS,
  type PlataformaOperacional,
} from './integracoes/types';
import { presetToCronExpression } from '@/lib/cronPresets';
import { cn } from '@/lib/utils';

interface IntegracaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /**
   * KeyInvoice (faturação) tem o seu próprio dialog dedicado
   * (FaturacaoIntegracaoDialog — testar ligação, definições avançadas,
   * doctypes), mais completo do que o wizard genérico login+password. Em vez
   * de duplicar essa lógica aqui, selecionar "KeyInvoice" no passo 1 fecha
   * este wizard e pede ao pai (IntegracoesTab) para abrir esse dialog.
   */
  onOpenFaturacao?: () => void;
}

const PLATFORMS: { id: PlataformaOperacional | 'keyinvoice'; name: string; logo: string }[] = [
  { id: 'uber', name: 'Uber', logo: '/images/logo-uber.png' },
  { id: 'bolt', name: 'Bolt', logo: '/images/logo-bolt.png' },
  { id: 'bp', name: 'BP', logo: '/images/logo-bp.png' },
  { id: 'repsol', name: 'Repsol', logo: '/images/logo-repsol.png' },
  { id: 'edp', name: 'EDP', logo: '/images/logo-edp.png' },
  { id: 'viaverde', name: 'Via Verde', logo: '/images/logo-via-verde.png' },
  { id: 'brevo', name: 'Brevo (Email)', logo: '/images/logo-brevo.png' },
  { id: 'keyinvoice', name: 'KeyInvoice', logo: '/images/logo-keyinvoice.svg' },
];

const STEP_LABELS = ['Seleção de plataforma', 'Credenciais', 'Confirmação'];

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum <= currentStep;
        const isCurrent = stepNum === currentStep;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  isActive ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
                )}
              >
                {stepNum < currentStep ? <Check className="h-4 w-4" /> : stepNum}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <ChevronRight
                className={cn(
                  'h-4 w-4 mx-2 mb-5 shrink-0',
                  stepNum < currentStep ? 'text-emerald-500' : 'text-muted-foreground/40'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export const IntegracaoDialog: React.FC<IntegracaoDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  onOpenFaturacao,
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    plataforma: '' as PlataformaOperacional | '',
    nome: '',
    login: '',
    password: '',
    cron_schedule: 'disabled' as 'disabled' | 'daily' | 'weekly' | 'custom',
    cron_custom: '',
    apiKey: '',
    senderName: '',
    senderEmail: '',
    replyTo: '',
  });
  const [brevoTestState, setBrevoTestState] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle'
  );
  const [brevoTestError, setBrevoTestError] = useState('');

  const resetForm = () => {
    setFormData({
      plataforma: '',
      nome: '',
      login: '',
      password: '',
      cron_schedule: 'disabled',
      cron_custom: '',
      apiKey: '',
      senderName: '',
      senderEmail: '',
      replyTo: '',
    });
    setShowPassword(false);
    setStep(1);
    setBrevoTestState('idle');
    setBrevoTestError('');
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const isBolt = formData.plataforma === 'bolt';
  const isUber = formData.plataforma === 'uber';
  const isBp = formData.plataforma === 'bp';
  const isRepsol = formData.plataforma === 'repsol';
  const isEdp = formData.plataforma === 'edp';
  const isViaVerde = formData.plataforma === 'viaverde';
  const defaults = isBolt
    ? BOLT_DEFAULTS
    : isBp
      ? BP_DEFAULTS
      : isRepsol
        ? REPSOL_DEFAULTS
        : isEdp
          ? EDP_DEFAULTS
          : isViaVerde
            ? VIAVERDE_DEFAULTS
            : UBER_DEFAULTS;
  const isBrevo = formData.plataforma === 'brevo';
  const needsLoginPassword = isUber || isBolt || isBp || isRepsol || isEdp || isViaVerde;
  const selectedPlatform = PLATFORMS.find((p) => p.id === formData.plataforma);

  const canProceedStep1 = !!formData.plataforma;
  // Via Verde usa robô Apify → precisa de credenciais do portal, tal como as outras.
  // Brevo exige teste de ligação aprovado antes de avançar — email errado
  // e silencioso é pior do que um robot mal configurado (ver brevo-test-connection).
  const canProceedStep2 = isBrevo
    ? !!(formData.senderName && formData.senderEmail) && brevoTestState === 'success'
    : !!(formData.login && formData.password);

  const handleTestBrevoConnection = async () => {
    if (!formData.apiKey) {
      toast({ title: 'Preencha a API Key primeiro', variant: 'destructive' });
      return;
    }
    setBrevoTestState('testing');
    setBrevoTestError('');
    try {
      const { data, error } = await supabase.functions.invoke('brevo-test-connection', {
        body: { api_key: formData.apiKey },
      });
      if (error || !data?.success) {
        setBrevoTestState('error');
        setBrevoTestError(data?.error || error?.message || 'Não foi possível ligar à Brevo');
        return;
      }
      setBrevoTestState('success');
      toast({ title: 'Ligação confirmada', description: 'API key da Brevo válida.' });
    } catch (err: any) {
      setBrevoTestState('error');
      setBrevoTestError(err.message || 'Não foi possível ligar à Brevo');
    }
  };

  const handleNext = () => {
    if (step === 1 && !canProceedStep1) {
      toast({ title: 'Selecione uma plataforma', variant: 'destructive' });
      return;
    }
    if (step === 2 && !canProceedStep2) {
      toast({ title: 'Preencha as credenciais', variant: 'destructive' });
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const maskEmail = (email: string) => {
    if (!email) return '';
    const [user, domain] = email.split('@');
    if (!domain) return email;
    return `${user.slice(0, 2)}***@${domain}`;
  };

  const handleSave = async () => {
    if (!formData.nome) {
      toast({
        title: 'Erro',
        description: 'Preencha o nome da integração',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // Brevo: integração de email da própria empresa (plataforma='email',
      // email_provider='brevo'). API key nunca é gravada em texto plano —
      // primeiro o INSERT sem a key, depois set_email_api_key() cifra-a
      // via pgp_sym_encrypt (RPC, ver migration 20260716110000).
      if (isBrevo) {
        const { data: inserted, error: brevoError } = await supabase
          .from('plataformas_configuracao')
          .insert({
            nome: formData.nome,
            plataforma: 'email',
            email_provider: 'brevo',
            email_sender_name: formData.senderName,
            email_sender_email: formData.senderEmail,
            email_reply_to: formData.replyTo || null,
            ativo: true,
          })
          .select('id')
          .single();
        if (brevoError) throw brevoError;

        const { error: keyError } = await supabase.rpc('set_email_api_key', {
          p_integracao_id: inserted.id,
          p_api_key: formData.apiKey,
        });
        if (keyError) throw keyError;

        toast({ title: 'Integração criada', description: `Brevo "${formData.nome}" criada.` });
        setSaving(false);
        onOpenChange(false);
        onSuccess();
        return;
      }

      // Via Verde segue o fluxo de robot Apify abaixo (mesmo caminho de
      // Uber/Bolt/BP/Repsol/EDP), incluindo a criação da via_verde_contas.
      let apifyApiToken: string | null = null;
      const { data: existingIntegrations } = await supabase
        .from('plataformas_configuracao')
        .select('apify_api_token')
        .eq('plataforma', 'robot')
        .not('apify_api_token', 'is', null)
        .limit(1);

      if (existingIntegrations && existingIntegrations.length > 0) {
        apifyApiToken = (existingIntegrations[0] as any).apify_api_token;
      }

      if (!apifyApiToken) {
        apifyApiToken = (defaults as any).apify_api_token || null;
      }

      const insertData: Record<string, any> = {
        nome: formData.nome,
        plataforma: isViaVerde ? 'via_verde' : 'robot',
        ativo: true,
        apify_actor_id: defaults.apify_actor_id,
        apify_api_token: apifyApiToken,
        auth_mode: (defaults as any).auth_mode || 'password',
        robot_target_platform: defaults.robot_target_platform,
      };

      if (!isViaVerde) {
        insertData.webhook_url = (defaults as any).site_url;
      }

      insertData.client_id = formData.login;
      insertData.client_secret = formData.password;
      insertData.cookies_json = null;

      const { data: insertedRows, error } = await supabase
        .from('plataformas_configuracao')
        .insert(insertData)
        .select('id')
        .single();

      if (error) throw error;

      // Via Verde: criar também a conta em via_verde_contas com as credenciais
      // do portal — o robot-execute lê sync_email/sync_password desta tabela.
      if (isViaVerde && insertedRows?.id) {
        const { error: contaError } = await supabase.from('via_verde_contas').insert({
          integracao_id: insertedRows.id,
          nome_conta: formData.nome,
          codigo_rac: 'IMPORTAR',
          ftp_host: '',
          ftp_utilizador: '',
          ftp_password: '',
          ftp_ativo: false,
          sync_email: formData.login,
          sync_password: formData.password,
          sync_ativo: true,
        });
        if (contaError) {
          console.error('Erro ao criar via_verde_contas:', contaError);
          toast({
            title: 'Aviso',
            description:
              'Integração criada mas a configuração da conta Via Verde falhou. Edite-a manualmente.',
            variant: 'destructive',
          });
        }
      }

      if (formData.cron_schedule !== 'disabled' && insertedRows?.id) {
        const cronExpr = presetToCronExpression(formData.cron_schedule, formData.cron_custom);
        if (cronExpr) {
          const { error: scheduleError } = await supabase.functions.invoke('robot-schedule', {
            body: { integracao_id: insertedRows.id, cron_expression: cronExpr },
          });
          if (scheduleError) {
            console.error('Erro ao criar agendamento:', scheduleError);
            toast({
              title: 'Aviso',
              description: 'Integração criada mas o agendamento automático falhou.',
              variant: 'destructive',
            });
          }
        }
      }

      toast({
        title: 'Sucesso',
        description: `Integração ${selectedPlatform?.name} criada com sucesso`,
      });
      handleClose(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível criar a integração',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova Integração</DialogTitle>
        </DialogHeader>

        <Stepper currentStep={step} />

        {/* Step 1: Platform Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione a plataforma que pretende integrar:
            </p>
            <div className="grid grid-cols-3 gap-4">
              {PLATFORMS.map((platform) => {
                const isSelected = formData.plataforma === platform.id;
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => {
                      if (platform.id === 'keyinvoice') {
                        handleClose(false);
                        onOpenFaturacao?.();
                        return;
                      }
                      setFormData((prev) => ({ ...prev, plataforma: platform.id }));
                    }}
                    className={cn(
                      'flex flex-col items-center justify-center gap-3 rounded-xl border-2 p-6 transition-all hover:shadow-md cursor-pointer bg-card',
                      isSelected
                        ? 'border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                        : 'border-border hover:border-muted-foreground/30'
                    )}
                  >
                    <img
                      src={platform.logo}
                      alt={platform.name}
                      className="h-16 w-16 object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="text-sm font-semibold text-foreground">{platform.name}</span>
                    {isSelected && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Credentials */}
        {step === 2 && selectedPlatform && (
          <div className="flex gap-6 min-h-[220px]">
            {/* Left: Logo */}
            <div className="flex flex-col items-center justify-center w-1/3 rounded-xl border border-border bg-muted/30 p-6">
              <img
                src={selectedPlatform.logo}
                alt={selectedPlatform.name}
                className="h-20 w-20 object-contain mb-3"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <span className="text-base font-semibold text-foreground">
                {selectedPlatform.name}
              </span>
            </div>

            {/* Right: Form */}
            <div className="flex-1 space-y-4">
              {isViaVerde ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Introduza as credenciais do <strong>portal Via Verde</strong>. O robô usará este
                    login para extrair automaticamente os extratos semanais.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="login">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="login"
                      type="email"
                      placeholder="email@empresa.com"
                      value={formData.login}
                      onChange={(e) => setFormData((prev) => ({ ...prev, login: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Password <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, password: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              ) : isBrevo ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    A sua empresa é responsável pela própria conta Brevo. Introduza a API Key gerada
                    em <em>brevo.com › SMTP &amp; API</em> e confirme a ligação antes de continuar.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="brevo-api-key">
                      API Key <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="brevo-api-key"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="xkeysib-..."
                          value={formData.apiKey}
                          onChange={(e) => {
                            setFormData((prev) => ({ ...prev, apiKey: e.target.value }));
                            setBrevoTestState('idle');
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestBrevoConnection}
                        disabled={brevoTestState === 'testing' || !formData.apiKey}
                      >
                        {brevoTestState === 'testing' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Testar ligação'
                        )}
                      </Button>
                    </div>
                    {brevoTestState === 'success' && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Ligação confirmada
                      </p>
                    )}
                    {brevoTestState === 'error' && (
                      <p className="text-xs text-destructive">{brevoTestError}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brevo-sender-name">
                      Sender Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="brevo-sender-name"
                      placeholder="Ex: Empresa X"
                      value={formData.senderName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, senderName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brevo-sender-email">
                      Sender Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="brevo-sender-email"
                      type="email"
                      placeholder="noreply@empresa-x.pt"
                      value={formData.senderEmail}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, senderEmail: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brevo-reply-to">Reply-To (opcional)</Label>
                    <Input
                      id="brevo-reply-to"
                      type="email"
                      placeholder="suporte@empresa-x.pt"
                      value={formData.replyTo}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, replyTo: e.target.value }))
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Introduza as credenciais da sua conta {selectedPlatform.name}.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="login">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="login"
                      type="email"
                      placeholder="email@empresa.com"
                      value={formData.login}
                      onChange={(e) => setFormData((prev) => ({ ...prev, login: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Password <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, password: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && selectedPlatform && (
          <div className="space-y-5">
            {/* Summary card */}
            <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4">
              <img
                src={selectedPlatform.logo}
                alt={selectedPlatform.name}
                className="h-14 w-14 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <div>
                <p className="font-semibold text-foreground">{selectedPlatform.name}</p>
                {isBrevo && formData.senderEmail && (
                  <p className="text-sm text-muted-foreground">{formData.senderEmail}</p>
                )}
                {!isBrevo && formData.login && (
                  <p className="text-sm text-muted-foreground">{maskEmail(formData.login)}</p>
                )}
              </div>
              <div className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="h-4 w-4 text-emerald-500" />
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="nome">
                Nome da Integração <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nome"
                placeholder={`Ex: ${selectedPlatform.name} WeGest`}
                value={formData.nome}
                onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>

            {/* Schedule — não aplicável ao Brevo (não há sincronização, só envio sob-demanda) */}
            {!isBrevo && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Agendamento Automático
                </Label>
                <Select
                  value={formData.cron_schedule}
                  onValueChange={(value: 'disabled' | 'daily' | 'weekly' | 'custom') =>
                    setFormData((prev) => ({ ...prev, cron_schedule: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Desativado</SelectItem>
                    <SelectItem value="daily">Diário (00:00)</SelectItem>
                    <SelectItem value="weekly">Semanal (Segunda 00:00)</SelectItem>
                    <SelectItem value="custom">Personalizado (Cron)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isBrevo && formData.cron_schedule === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="cron_custom">Expressão Cron</Label>
                <Input
                  id="cron_custom"
                  placeholder="0 23 * * 0"
                  value={formData.cron_custom}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cron_custom: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Formato: minuto hora dia_mês mês dia_semana (UTC)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between pt-2">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            {step < 3 ? (
              <Button
                onClick={handleNext}
                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              >
                Seguir
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving || !formData.nome}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />A criar...
                  </>
                ) : (
                  'Criar Integração'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
