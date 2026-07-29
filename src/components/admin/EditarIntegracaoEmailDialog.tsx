import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEditarIntegracaoEmail } from '@/hooks/useEditarIntegracaoEmail';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Eye, EyeOff, ChevronDown, ChevronRight, Check } from 'lucide-react';

/** Linha de integração de email (plataforma='email', email_provider='brevo'). */
export interface EmailIntegracaoRow {
  id: string;
  nome: string;
  email_sender_name: string | null;
  email_sender_email: string | null;
  email_reply_to: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: EmailIntegracaoRow | null;
  onSuccess: () => void;
}

/**
 * Edição da integração Brevo já criada — nome, remetente e reply-to.
 * A API Key só é alterada se o utilizador abrir "Alterar API Key" e
 * introduzir uma nova (nunca é lida de volta, fica cifrada na BD).
 */
export function EditarIntegracaoEmailDialog({ open, onOpenChange, row, onSuccess }: Props) {
  const { toast } = useToast();

  const [nome, setNome] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');

  const [showApiKeySection, setShowApiKeySection] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const editMutation = useEditarIntegracaoEmail();

  useEffect(() => {
    if (!open) return;
    setNome(row?.nome || '');
    setSenderName(row?.email_sender_name || '');
    setSenderEmail(row?.email_sender_email || '');
    setReplyTo(row?.email_reply_to || '');
    setShowApiKeySection(false);
    setApiKey('');
    setShowApiKey(false);
    setTestState('idle');
    setTestError('');
  }, [open, row]);

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      toast({ title: 'Preencha a nova API Key primeiro', variant: 'destructive' });
      return;
    }
    setTestState('testing');
    setTestError('');
    try {
      const { data, error } = await supabase.functions.invoke('brevo-test-connection', {
        body: { api_key: apiKey.trim() },
      });
      if (error || !data?.success) {
        setTestState('error');
        setTestError(data?.error || error?.message || 'Não foi possível ligar à Brevo');
        return;
      }
      setTestState('success');
      toast({ title: 'Ligação confirmada', description: 'API key da Brevo válida.' });
    } catch (err: any) {
      setTestState('error');
      setTestError(err.message || 'Não foi possível ligar à Brevo');
    }
  };

  const handleSave = async () => {
    if (!row?.id) return;
    if (!nome.trim() || !senderName.trim() || !senderEmail.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha o nome, o remetente e o email de envio.',
        variant: 'destructive',
      });
      return;
    }
    if (showApiKeySection && apiKey.trim() && testState !== 'success') {
      toast({
        title: 'Teste a nova API Key',
        description: 'Confirme a ligação antes de guardar uma API Key nova.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await editMutation.mutateAsync({
        id: row.id,
        nome: nome.trim(),
        senderName: senderName.trim(),
        senderEmail: senderEmail.trim(),
        replyTo: replyTo.trim(),
        apiKey: showApiKeySection && apiKey.trim() ? apiKey.trim() : undefined,
      });

      toast({ title: 'Integração atualizada', description: `Brevo "${nome.trim()}" atualizada.` });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível guardar as alterações',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar integração Brevo</DialogTitle>
          <DialogDescription>
            Altere o nome da integração ou o remetente dos emails enviados pela sua organização.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-brevo-nome">
              Nome da Integração <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-brevo-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-brevo-sender-name">
              Sender Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-brevo-sender-name"
              placeholder="Ex: Empresa X"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-brevo-sender-email">
              Sender Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-brevo-sender-email"
              type="email"
              placeholder="noreply@empresa-x.pt"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-brevo-reply-to">Reply-To (opcional)</Label>
            <Input
              id="edit-brevo-reply-to"
              type="email"
              placeholder="suporte@empresa-x.pt"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
            />
          </div>

          <Separator />

          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowApiKeySection((v) => !v)}
          >
            {showApiKeySection ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Alterar API Key
          </button>

          {showApiKeySection && (
            <div className="space-y-2">
              <Label htmlFor="edit-brevo-api-key">Nova API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="edit-brevo-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="xkeysib-..."
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestState('idle');
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestApiKey}
                  disabled={testState === 'testing' || !apiKey.trim()}
                >
                  {testState === 'testing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Testar ligação'
                  )}
                </Button>
              </div>
              {testState === 'success' && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Ligação confirmada
                </p>
              )}
              {testState === 'error' && <p className="text-xs text-destructive">{testError}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={editMutation.isPending}>
            {editMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
              </>
            ) : (
              'Guardar alterações'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
