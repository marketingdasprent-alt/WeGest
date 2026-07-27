import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Eye, EyeOff, Plug, ChevronDown, ChevronRight, Info } from 'lucide-react';
import {
  FATURACAO_PROVIDERS,
  FATURACAO_PROVIDER_OPTIONS,
  faturacaoProviderLabel,
} from '@/lib/faturacaoProviders';
import type { Json } from '@/integrations/supabase/types';

/** Settings específicos do provider (guardados em plataformas_configuracao.config). */
interface FaturacaoConfig {
  provider?: string;
  endpoint?: string;
  doctypes?: { FT?: string; FR?: string; NC?: string; RC?: string };
  default_product?: string;
  default_idtax?: string;
}

/** Linha de config de faturação (plataforma='faturacao'). */
export interface FaturacaoConfigRow {
  id: string;
  client_secret: string | null;
  config: FaturacaoConfig | null;
  ativo: boolean | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Config existente (ou null se ainda não foi configurada). */
  row: FaturacaoConfigRow | null;
  onSuccess: () => void;
}

/**
 * Configura o software de faturação fiscal da organização. Trocar de software é
 * só escolher outro provider e colar a chave — o resto (endpoint, doctypes,
 * defaults) vem dos defaults do adapter, com override opcional em "avançado".
 */
export function FaturacaoIntegracaoDialog({ open, onOpenChange, row, onSuccess }: Props) {
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [provider, setProvider] = useState('keyinvoice');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [defaultProduct, setDefaultProduct] = useState('');
  const [defaultIdTax, setDefaultIdTax] = useState('');
  const [dt, setDt] = useState({ FT: '', FR: '', NC: '', RC: '' });

  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = row?.config ?? {};
    setProvider(c.provider || 'keyinvoice');
    setApiKey(row?.client_secret || '');
    setEndpoint(c.endpoint || '');
    setDefaultProduct(c.default_product || '');
    setDefaultIdTax(c.default_idtax || '');
    setDt({
      FT: c.doctypes?.FT || '',
      FR: c.doctypes?.FR || '',
      NC: c.doctypes?.NC || '',
      RC: c.doctypes?.RC || '',
    });
    setShowKey(false);
    setShowAdvanced(false);
  }, [open, row]);

  function buildSettings(): FaturacaoConfig {
    const doctypes: FaturacaoConfig['doctypes'] = {};
    (['FT', 'FR', 'NC', 'RC'] as const).forEach((k) => {
      if (dt[k].trim()) doctypes[k] = dt[k].trim();
    });
    const s: FaturacaoConfig = { provider };
    if (endpoint.trim()) s.endpoint = endpoint.trim();
    if (Object.keys(doctypes).length) s.doctypes = doctypes;
    if (defaultProduct.trim()) s.default_product = defaultProduct.trim();
    if (defaultIdTax.trim()) s.default_idtax = defaultIdTax.trim();
    return s;
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      toast.error('Introduza a chave da API antes de testar.');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('faturacao-emitir', {
        body: { action: 'health', provider, apiKey: apiKey.trim(), settings: buildSettings() },
      });
      if (error) throw new Error(error.message);
      if (data?.ok) {
        toast.success(`Ligação ao ${faturacaoProviderLabel(provider)} confirmada.`);
      } else {
        toast.error(`Falha na ligação: ${data?.error || 'verifique a chave.'}`);
      }
    } catch (e) {
      toast.error(`Falha na ligação: ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!provider) {
      toast.error('Escolha o software de faturação.');
      return;
    }
    if (!apiKey.trim()) {
      toast.error('Introduza a chave da API.');
      return;
    }
    setSaving(true);
    try {
      const settings = buildSettings();
      if (row?.id) {
        const { error } = await supabase
          .from('plataformas_configuracao')
          .update({
            client_secret: apiKey.trim(),
            config: settings as unknown as Json,
            ativo: true,
            nome: 'Faturação',
          })
          .eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('plataformas_configuracao').insert({
          plataforma: 'faturacao',
          nome: 'Faturação',
          ativo: true,
          client_secret: apiKey.trim(),
          config: settings as unknown as Json,
        });
        if (error) throw error;
      }

      // Slug público (legível por toda a org) — dita o nome mostrado na app.
      let defQuery = supabase.from('org_definicoes').update({ faturacao_provider: provider });
      defQuery = orgId ? defQuery.eq('org_id', orgId) : defQuery.not('org_id', 'is', null);
      const { error: defErr } = await defQuery;
      if (defErr) throw defErr;

      qc.invalidateQueries({ queryKey: ['org-definicoes'] });
      toast.success('Software de faturação configurado.');
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Não foi possível guardar: ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Software de faturação</DialogTitle>
          <DialogDescription>
            Escolha o software fiscal e cole a chave da API. A emissão (faturas, recibos, notas de
            crédito) passa a ser feita neste software. A chave fica guardada de forma segura e nunca
            é exposta no browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fat-provider">Software de faturação</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="fat-provider">
                <SelectValue placeholder="Escolher software" />
              </SelectTrigger>
              <SelectContent>
                {FATURACAO_PROVIDER_OPTIONS.map((p) => (
                  <SelectItem key={p.slug} value={p.slug}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {FATURACAO_PROVIDERS[provider]?.brandingHelp && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Aspeto do PDF (logótipo, cores)
              </p>
              <p>
                O documento fiscal é desenhado pelo {faturacaoProviderLabel(provider)} — a marca
                configura-se no painel deles:
              </p>
              <ul className="list-disc space-y-1 pl-4">
                {FATURACAO_PROVIDERS[provider]!.brandingHelp!.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fat-key">
              Chave da API <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="fat-key"
                type={showKey ? 'text' : 'password'}
                placeholder="Cole aqui a chave da API"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setShowKey((s) => !s)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Para o {faturacaoProviderLabel(provider)}, normalmente basta a chave — o resto usa os
              valores por defeito.
            </p>
          </div>

          <Separator />

          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvanced((s) => !s)}
          >
            {showAdvanced ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Definições avançadas (opcional)
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-md border bg-muted/20 p-4">
              <div className="space-y-2">
                <Label htmlFor="fat-endpoint">Endpoint da API</Label>
                <Input
                  id="fat-endpoint"
                  placeholder="Deixe vazio para usar o endpoint por defeito"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fat-prod">Artigo genérico (id/ref)</Label>
                  <Input
                    id="fat-prod"
                    placeholder="p/ linhas de texto livre"
                    value={defaultProduct}
                    onChange={(e) => setDefaultProduct(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fat-idtax">IVA por defeito (id)</Label>
                  <Input
                    id="fat-idtax"
                    placeholder="id de recurso"
                    value={defaultIdTax}
                    onChange={(e) => setDefaultIdTax(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipos de documento (DocType)</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(['FT', 'FR', 'NC', 'RC'] as const).map((k) => (
                    <div key={k} className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">{k}</span>
                      <Input
                        value={dt[k]}
                        onChange={(e) => setDt((prev) => ({ ...prev, [k]: e.target.value }))}
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Só preencher se o software exigir códigos diferentes dos predefinidos. O RC
                  (recibo) costuma não ter predefinição.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || saving}
            className="gap-2"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Testar ligação
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || testing} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
