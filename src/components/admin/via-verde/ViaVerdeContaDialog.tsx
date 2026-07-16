import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Network, Save } from 'lucide-react';
import { VIA_VERDE_DEFAULT_FORM_VALUES, ViaVerdeConta, ViaVerdeContaFormValues } from './types';
import { ViaVerdeLogoUpload } from './ViaVerdeLogoUpload';

const contaSchema = z.object({
  nome_conta: z.string().trim().min(1, 'O nome da conta é obrigatório.').max(120),
  codigo_rac: z.string().trim().min(1, 'O código RAC é obrigatório.').max(60),
  ftp_host: z.string().trim().max(255).optional().default(''),
  ftp_porta: z.coerce.number().int().min(1).max(65535).optional().default(21),
  ftp_protocolo: z.enum(['ftp', 'sftp']).default('ftp'),
  ftp_utilizador: z.string().trim().max(255).optional().default(''),
  ftp_password: z.string().trim().max(255).optional().default(''),
  sync_email: z
    .string()
    .trim()
    .min(1, 'O email de login do portal Via Verde é obrigatório para o robô Apify.')
    .max(255),
  sync_password: z
    .string()
    .trim()
    .min(1, 'A password do portal Via Verde é obrigatória para o robô Apify.')
    .max(255),
  ftp_modo_passivo: z.boolean().default(true),
  ftp_ativo: z.boolean().default(false),
  sync_ativo: z.boolean().default(true),
});

type TestResponse = {
  success?: boolean;
  error?: string;
  ftp?: { success?: boolean; message?: string; code?: string };
  portal?: { success?: boolean; message?: string };
};

interface ViaVerdeContaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integracaoId: string;
  conta?: ViaVerdeConta | null;
  onSuccess: () => void;
}

const getValidationMessage = (error: z.ZodError) =>
  error.issues[0]?.message ?? 'Verifique os dados introduzidos.';

const getInvokeErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return 'Não foi possível testar a ligação.';
  }

  const message = error.message.toLowerCase();

  if (message.includes('failed to send a request') || message.includes('fetch failed')) {
    return 'A função de teste da Via Verde não está disponível de momento.';
  }

  if (message.includes('functionshttperror') || message.includes('non-2xx')) {
    return 'O teste foi rejeitado pelo servidor. Confirme se tem sessão activa e permissões de administrador.';
  }

  if (message.includes('403')) {
    return 'Sem permissão para testar esta ligação.';
  }

  if (message.includes('401') || message.includes('jwt')) {
    return 'A sua sessão expirou. Volte a iniciar sessão e tente novamente.';
  }

  return error.message;
};

const getTestFeedback = (data: TestResponse) => {
  const ftpMessage = data.ftp?.message;
  const portalMessage = data.portal?.message;

  if (data.success) {
    return {
      title: 'Ligação validada',
      description: ftpMessage || portalMessage || 'A ligação foi validada com sucesso.',
      variant: 'default' as const,
    };
  }

  if (data.portal?.success && ftpMessage) {
    return {
      title: 'Falha no teste de ligação',
      description: `Portal validado com sucesso. FTP/SFTP falhou: ${ftpMessage}`,
      variant: 'destructive' as const,
    };
  }

  if (data.ftp?.success && portalMessage) {
    return {
      title: 'Falha no teste de ligação',
      description: `FTP/SFTP validado com sucesso. Portal falhou: ${portalMessage}`,
      variant: 'destructive' as const,
    };
  }

  return {
    title: 'Falha no teste de ligação',
    description:
      [ftpMessage, portalMessage, data.error].filter(Boolean).join(' • ') ||
      'Não foi possível validar a ligação.',
    variant: 'destructive' as const,
  };
};

export const ViaVerdeContaDialog: React.FC<ViaVerdeContaDialogProps> = ({
  open,
  onOpenChange,
  integracaoId,
  conta,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<ViaVerdeContaFormValues>(VIA_VERDE_DEFAULT_FORM_VALUES);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (conta) {
      setFormData({
        nome_conta: conta.nome_conta,
        codigo_rac: conta.codigo_rac,
        ftp_host: conta.ftp_host || '',
        ftp_porta: conta.ftp_porta ? String(conta.ftp_porta) : '21',
        ftp_protocolo: conta.ftp_protocolo || 'ftp',
        ftp_modo_passivo: conta.ftp_modo_passivo ?? true,
        ftp_utilizador: conta.ftp_utilizador || '',
        ftp_password: conta.ftp_password || '',
        ftp_ativo: conta.ftp_ativo ?? false,
        sync_email: conta.sync_email || '',
        sync_password: conta.sync_password || '',
        sync_ativo: conta.sync_ativo ?? true,
      });
      setLogoUrl(conta.logo_url ?? null);
    } else {
      setFormData(VIA_VERDE_DEFAULT_FORM_VALUES);
      setLogoUrl(null);
    }
  }, [conta, open]);

  const updateField = <K extends keyof ViaVerdeContaFormValues>(
    field: K,
    value: ViaVerdeContaFormValues[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getPayload = () => contaSchema.parse(formData);

  const handleTest = async () => {
    try {
      const payload = getPayload();
      setTesting(true);

      const { data, error } = await supabase.functions.invoke<TestResponse>(
        'via-verde-test-connection',
        {
          body: payload,
        }
      );

      if (error) throw error;

      const feedback = getTestFeedback(data ?? {});
      toast(feedback);
    } catch (error) {
      const message =
        error instanceof z.ZodError ? getValidationMessage(error) : getInvokeErrorMessage(error);

      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = getPayload();
      setSaving(true);

      const supabaseAny = supabase as any;
      const values = {
        integracao_id: integracaoId,
        ...payload,
        logo_url: logoUrl,
      };

      const query = conta
        ? supabaseAny.from('via_verde_contas').update(values).eq('id', conta.id)
        : supabaseAny.from('via_verde_contas').insert(values);

      const { error } = await query;
      if (error) {
        console.error('[ViaVerdeContaDialog] Erro Supabase ao guardar:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          values,
        });
        throw error;
      }

      toast({
        title: conta ? 'Conta actualizada' : 'Conta criada',
        description: 'Os dados da Via Verde foram guardados.',
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? getValidationMessage(error)
          : error instanceof Error
            ? error.message
            : 'Não foi possível guardar a conta.';
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{conta ? 'Editar conta Via Verde' : 'Nova Conta Via Verde'}</DialogTitle>
          <DialogDescription>
            Configure o acesso FTP e a sincronização de dispositivos desta conta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome_conta">Nome da Conta</Label>
            <Input
              id="nome_conta"
              value={formData.nome_conta}
              onChange={(e) => updateField('nome_conta', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codigo_rac">Código RAC</Label>
            <Input
              id="codigo_rac"
              value={formData.codigo_rac}
              onChange={(e) => updateField('codigo_rac', e.target.value)}
            />
          </div>
          <ViaVerdeLogoUpload
            contaId={conta?.id ?? null}
            logoUrl={logoUrl}
            onLogoChange={setLogoUrl}
          />
        </div>

        <Tabs defaultValue="ftp" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
            <TabsTrigger value="ftp">FTP</TabsTrigger>
            <TabsTrigger value="sync">Sincronização de Dispositivos</TabsTrigger>
          </TabsList>

          <TabsContent value="ftp" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ftp_host">Endereço do Servidor</Label>
                <Input
                  id="ftp_host"
                  value={formData.ftp_host}
                  onChange={(e) => updateField('ftp_host', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ftp_porta">Porta</Label>
                <Input
                  id="ftp_porta"
                  type="number"
                  value={formData.ftp_porta}
                  onChange={(e) => updateField('ftp_porta', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Protocolo</Label>
                <Select
                  value={formData.ftp_protocolo}
                  onValueChange={(value: 'ftp' | 'sftp') => updateField('ftp_protocolo', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ftp">FTP</SelectItem>
                    <SelectItem value="sftp">SFTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ftp_utilizador">Utilizador</Label>
                <Input
                  id="ftp_utilizador"
                  value={formData.ftp_utilizador}
                  onChange={(e) => updateField('ftp_utilizador', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ftp_password">Password</Label>
                <Input
                  id="ftp_password"
                  type="password"
                  value={formData.ftp_password}
                  onChange={(e) => updateField('ftp_password', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2">
              {formData.ftp_protocolo === 'ftp' ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Modo passivo</p>
                    <p className="text-xs text-muted-foreground">
                      Aplicado no teste e ligação FTP.
                    </p>
                  </div>
                  <Switch
                    checked={formData.ftp_modo_passivo}
                    onCheckedChange={(checked) => updateField('ftp_modo_passivo', checked)}
                  />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Modo passivo indisponível</p>
                  <p className="text-xs text-muted-foreground">
                    Este parâmetro só se aplica a ligações FTP.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Conta FTP activa</p>
                  <p className="text-xs text-muted-foreground">
                    Mantém esta conta disponível para sincronizações.
                  </p>
                </div>
                <Switch
                  checked={formData.ftp_ativo}
                  onCheckedChange={(checked) => updateField('ftp_ativo', checked)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sync" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sync_email">Email / Utilizador</Label>
                <Input
                  id="sync_email"
                  value={formData.sync_email}
                  onChange={(e) => updateField('sync_email', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sync_password">Password</Label>
                <Input
                  id="sync_password"
                  type="password"
                  value={formData.sync_password}
                  onChange={(e) => updateField('sync_password', e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">Sincronização activa</p>
                <p className="text-xs text-muted-foreground">
                  Permite utilizar estas credenciais para o portal Via Verde.
                </p>
              </div>
              <Switch
                checked={formData.sync_ativo}
                onCheckedChange={(checked) => updateField('sync_ativo', checked)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={handleTest} disabled={testing || saving}>
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Network className="mr-2 h-4 w-4" />
              )}
              Testar ligação
            </Button>
            <Button onClick={handleSave} disabled={saving || testing}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar conta
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
