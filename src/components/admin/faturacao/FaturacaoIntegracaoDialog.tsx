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
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  Eye,
  EyeOff,
  Plug,
  ChevronDown,
  ChevronRight,
  Info,
  AlertTriangle,
  Sparkles,
  Copy,
} from 'lucide-react';
import { FATURACAO_PROVIDERS, faturacaoProviderLabel } from '@/lib/faturacaoProviders';
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
  /** Provider fixo desta integração (ex.: 'keyinvoice', 'primavera') — vem do
   *  tile escolhido em "Adicionar plataforma" ou do cartão editado. Cada
   *  provider é uma integração PRÓPRIA (linha própria em
   *  plataformas_configuracao); este diálogo nunca troca de provider a meio
   *  — trocar de software é configurar o outro separadamente e ativá-lo. */
  provider: string;
  /** Config existente desse provider (ou null se ainda não foi configurada). */
  row: FaturacaoConfigRow | null;
  /** Já existe outra integração de faturação ativa (a emitir a sério) nesta
   *  org, diferente desta? Dita o valor por omissão do interruptor "Ativar" —
   *  nunca activar sozinho por omissão se isso ia desligar outra em produção. */
  existeOutraIntegracaoAtiva: boolean;
  onSuccess: () => void;
}

/**
 * Configura UMA integração de faturação fiscal (um provider fixo, ex.:
 * KeyInvoice OU Primavera) da organização. Cada provider tem a sua própria
 * linha/chave/estado — nunca partilhada. Só uma pode estar ativa (a emitir
 * de facto) por org — "Guardar" grava sempre; só ativa (e desactiva as
 * outras) se o interruptor "Ativar" estiver ligado, para dar para testar uma
 * integração nova sem cortar a que já está em produção.
 */
export function FaturacaoIntegracaoDialog({
  open,
  onOpenChange,
  provider,
  row,
  existeOutraIntegracaoAtiva,
  onSuccess,
}: Props) {
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [apiKey, setApiKey] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [endpoint, setEndpoint] = useState('');
  const [defaultProduct, setDefaultProduct] = useState('');
  const [defaultIdTax, setDefaultIdTax] = useState('');
  const [dt, setDt] = useState({ FT: '', FR: '', NC: '', RC: '' });

  const providerMeta = FATURACAO_PROVIDERS[provider];

  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [gerandoChave, setGerandoChave] = useState(false);
  // A chave gerada nesta sessão do diálogo ainda não foi guardada — mostra-se
  // sempre em claro (é a única oportunidade de a copiar). Uma chave que veio
  // de `row` (já gravada antes) segue a regra normal do campo (escondida,
  // revelável pelo olho) — não há razão nova para a mostrar por omissão.
  const [chaveAcabouDeSerGerada, setChaveAcabouDeSerGerada] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = row?.config ?? {};
    setApiKey(row?.client_secret || '');
    // A integrar de novo (row null): activa por omissão só se não houver
    // nenhuma outra já em produção — não desligar uma que já funciona só
    // por se ter aberto este diálogo. A editar uma já existente: mantém o
    // que já lá estava (editar credenciais não deve mudar isto sozinho).
    setAtivo(row ? !!row.ativo : !existeOutraIntegracaoAtiva);
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
    setChaveAcabouDeSerGerada(false);
  }, [open, row, existeOutraIntegracaoAtiva]);

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

  /** Gera a chave do agente (RPC no Postgres, nunca calculada no browser) e
   *  mostra-a já em claro — é a única vez que se vê por inteiro. */
  async function handleGerarChave() {
    setGerandoChave(true);
    try {
      const { data, error } = await supabase.rpc('gerar_chave_agente_primavera');
      if (error) throw error;
      setApiKey(data as string);
      setChaveAcabouDeSerGerada(true);
      setShowKey(true);
    } catch (e) {
      toast.error(`Não foi possível gerar a chave: ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setGerandoChave(false);
    }
  }

  async function handleCopiarChave() {
    try {
      await navigator.clipboard.writeText(apiKey);
      toast.success('Chave copiada.');
    } catch {
      toast.error('Não foi possível copiar — selecione e copie manualmente.');
    }
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      toast.error(
        `Introduza ${providerMeta?.apiKeyLabel ? 'a ' + providerMeta.apiKeyLabel.toLowerCase() : 'a chave da API'} antes de testar.`
      );
      return;
    }
    setTesting(true);
    try {
      // Primavera (chave gerada pelo WeGest): o teste confirma que o AGENTE
      // já configurado está a responder — depende de a linha já estar
      // gravada (senão não há fila nenhuma onde pôr o pedido de teste, é o
      // próprio adapter que explica isto na mensagem de erro). Manda-se o
      // `provider` explícito (não confiar em "o que estiver ativo agora") —
      // esta integração pode estar a ser testada sem ainda ser a que emite
      // de facto (ex.: Primavera em teste enquanto o KeyInvoice continua em
      // produção).
      const body = providerMeta?.chaveGeradaPeloWeGest
        ? { action: 'health', provider }
        : { action: 'health', provider, apiKey: apiKey.trim(), settings: buildSettings() };
      const { data, error } = await supabase.functions.invoke('faturacao-emitir', { body });
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
    if (!apiKey.trim()) {
      toast.error(
        `Introduza ${providerMeta?.apiKeyLabel ? 'a ' + providerMeta.apiKeyLabel.toLowerCase() : 'a chave da API'}.`
      );
      return;
    }
    setSaving(true);
    try {
      const settings = buildSettings();
      const nome = providerMeta?.label || provider;

      // "Ativar" (ligado) promove ESTA integração a activa (é a que passa a
      // emitir de facto) — só pode haver uma por org (índice único na BD).
      // Desativar as outras primeiro, senão o insert/update seguinte falha a
      // violar esse índice. Com "Ativar" desligado, isto só GRAVA as
      // credenciais (para testar) sem mexer em qual está em produção.
      if (ativo) {
        const { error: deactivateErr } = await supabase
          .from('plataformas_configuracao')
          .update({ ativo: false })
          .eq('plataforma', 'faturacao')
          .neq('id', row?.id ?? '00000000-0000-0000-0000-000000000000');
        if (deactivateErr) throw deactivateErr;
      }

      if (row?.id) {
        const { error } = await supabase
          .from('plataformas_configuracao')
          .update({
            client_secret: apiKey.trim(),
            config: settings as unknown as Json,
            ativo,
            nome,
          })
          .eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('plataformas_configuracao').insert({
          plataforma: 'faturacao',
          nome,
          ativo,
          client_secret: apiKey.trim(),
          config: settings as unknown as Json,
        });
        if (error) throw error;
      }

      // Slug público (legível por toda a org) — dita o nome mostrado na app.
      // Só faz sentido apontar para este provider se ele for mesmo o activo;
      // gravar uma integração inactiva (só para testar) nunca deve mudar o
      // que a app mostra como "o software em uso".
      if (ativo) {
        let defQuery = supabase.from('org_definicoes').update({ faturacao_provider: provider });
        defQuery = orgId ? defQuery.eq('org_id', orgId) : defQuery.not('org_id', 'is', null);
        const { error: defErr } = await defQuery;
        if (defErr) throw defErr;
      }

      qc.invalidateQueries({ queryKey: ['org-definicoes'] });
      toast.success(
        ativo
          ? `${nome} configurado e ativado — passa a ser o software a emitir documentos.`
          : `${nome} guardado (inativo) — pode testar-se sem afetar o que está em produção.`
      );
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
          <DialogTitle>{providerMeta?.label || provider}</DialogTitle>
          <DialogDescription>
            Integração própria e independente das restantes. Guardar grava sempre a chave — só
            promove {providerMeta?.label || provider} a software activo (o que emite de facto) se
            "Usar para emitir documentos", em baixo, estiver ligado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          {!!providerMeta?.tiposNaoSuportados?.length && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
              <p>
                Nesta ligação, {providerMeta.tiposNaoSuportados.join(', ')} ainda não estão
                disponíveis — só{' '}
                {['FT', 'FR', 'NC', 'RC']
                  .filter(
                    (t) => !providerMeta.tiposNaoSuportados!.includes(t as 'FR' | 'NC' | 'RC')
                  )
                  .join(', ')}{' '}
                funciona por agora, até confirmar com o fornecedor.
              </p>
            </div>
          )}

          {providerMeta?.chaveGeradaPeloWeGest ? (
            <div className="space-y-2">
              <Label htmlFor="fat-key">
                {providerMeta.apiKeyLabel || 'Chave'} <span className="text-destructive">*</span>
              </Label>
              {!apiKey ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGerarChave}
                  disabled={gerandoChave}
                  className="gap-2"
                >
                  {gerandoChave ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Gerar {(providerMeta.apiKeyLabel || 'chave').toLowerCase()}
                </Button>
              ) : (
                <>
                  <div className="relative">
                    <Input
                      id="fat-key"
                      type={showKey || chaveAcabouDeSerGerada ? 'text' : 'password'}
                      value={apiKey}
                      readOnly
                      className="pr-16 font-mono text-xs"
                    />
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleCopiarChave}
                        title="Copiar"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {!chaveAcabouDeSerGerada && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setShowKey((s) => !s)}
                          title={showKey ? 'Ocultar' : 'Mostrar'}
                        >
                          {showKey ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {chaveAcabouDeSerGerada && (
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Copie agora — não volta a ser mostrada por inteiro depois de fechar isto.
                    </p>
                  )}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={handleGerarChave}
                    disabled={gerandoChave}
                  >
                    Gerar nova chave (invalida a anterior)
                  </button>
                </>
              )}
              {providerMeta.chaveGeradaAjuda && (
                <p className="text-xs text-muted-foreground">{providerMeta.chaveGeradaAjuda}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fat-key">
                {providerMeta?.apiKeyLabel || 'Chave da API'}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="fat-key"
                  type={showKey ? 'text' : 'password'}
                  placeholder={
                    providerMeta?.apiKeyLabel
                      ? `Introduza ${providerMeta.apiKeyLabel.toLowerCase()}`
                      : 'Cole aqui a chave da API'
                  }
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
                Para o {faturacaoProviderLabel(provider)}, normalmente basta a chave — o resto usa
                os valores por defeito.
              </p>
            </div>
          )}

          {/* Primavera não tem nada disto: endpoint/username/enterprise/password
              e os códigos de IVA vivem só na configuração local do agente
              (agent/primavera-agent/), nunca nesta base de dados. */}
          {!providerMeta?.chaveGeradaPeloWeGest && (
            <>
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
            </>
          )}

          <Separator />

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="fat-ativo">Usar para emitir documentos</Label>
              <p className="text-xs text-muted-foreground">
                {ativo && existeOutraIntegracaoAtiva
                  ? 'Desliga a outra integração de faturação em produção — só uma pode estar activa.'
                  : ativo
                    ? 'Ao guardar, passa a ser esta a emitir faturas, recibos e notas de crédito.'
                    : 'Fica guardada e testável, mas continua a ser a outra integração a emitir de facto.'}
              </p>
            </div>
            <Switch id="fat-ativo" checked={ativo} onCheckedChange={setAtivo} />
          </div>
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
