/**
 * "Nova Fatura" — fatura ADICIONAL de um contrato ou reserva, com linhas
 * livres (artigos digitados à mão). Permite emitir mais que uma fatura por
 * contrato/reserva.
 *
 * - O campo "Tipo" da linha é uma lista fixa (FATURA_ARTIGO_TIPOS); descrição,
 *   valor e unidades são livres.
 * - O valor inserido é COM IVA incluído (23%); o checkbox "Isento IVA" põe a
 *   linha a 0%. O sub-total/IVA são derivados a partir daí.
 * - Cria uma cobrança `manual = true` (fora do índice único de período, por
 *   isso convive com a faturação automática) e emite o documento fiscal no
 *   provider configurado. NÃO altera o estado_financeiro do contrato.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Receipt, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import { METODO_OPTIONS, metodoLabel } from '@/components/administrativo/faturacao';
import { openFaturacaoDocumento, type FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
import { baixarDocumentoPdf, clienteRowToFatura } from '@/lib/faturacao';
import { useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { useOrgDefinicoes } from '@/hooks/useOrgDefinicoes';
import { faturacaoProviderLabel } from '@/lib/faturacaoProviders';
import { FATURA_ARTIGO_TIPOS } from '@/lib/faturaArtigoTipos';
import type { ItemFatura } from '@/types/faturacao';

const IVA_PADRAO = 23;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const hoje = () => new Date().toISOString().slice(0, 10);
const maisDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Alvo da fatura: um contrato OU uma reserva. */
export type NovaFaturaAlvo =
  | {
      tipo: 'contrato';
      id: string;
      orgId: string;
      /** ex.: "Contrato #0123" */
      codigoLabel: string;
    }
  | {
      tipo: 'reserva';
      id: string;
      orgId: string;
      /** ex.: "Reserva #45" */
      codigoLabel: string;
    };

export interface NovaFaturaDestinatario {
  id: string;
  nome: string;
}

interface LinhaArtigo {
  /** id local p/ a key da lista */
  key: string;
  tipo: string;
  descricao: string;
  /** valor unitário COM IVA incluído */
  valor: string;
  unidades: string;
  isentoIva: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alvo: NovaFaturaAlvo;
  destinatario: NovaFaturaDestinatario;
  emitente?: FaturacaoDocEmitente | null;
  onCriada: () => void;
}

let linhaSeq = 0;
const novaLinha = (): LinhaArtigo => ({
  key: `l${++linhaSeq}`,
  tipo: '',
  descricao: '',
  valor: '',
  unidades: '1',
  isentoIva: false,
});

export function NovaFaturaDialog({
  open,
  onOpenChange,
  alvo,
  destinatario,
  emitente,
  onCriada,
}: Props) {
  const qc = useQueryClient();
  const emitirMut = useEmitirEEscreverFatura();
  const { data: orgDef } = useOrgDefinicoes();
  const providerLabel = faturacaoProviderLabel(orgDef?.faturacao_provider);
  const [tipoDoc, setTipoDoc] = useState<'fatura' | 'fatura_recibo'>('fatura');
  const [metodo, setMetodo] = useState<string>('transferencia');
  const [dataDoc, setDataDoc] = useState<string>(hoje());
  const [dataVenc, setDataVenc] = useState<string>(maisDias(30));
  const [linhas, setLinhas] = useState<LinhaArtigo[]>([novaLinha()]);
  const [submitting, setSubmitting] = useState(false);

  function patchLinha(key: string, patch: Partial<LinhaArtigo>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLinha() {
    setLinhas((prev) => [...prev, novaLinha()]);
  }
  function removeLinha(key: string) {
    setLinhas((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  // Cada linha: valor é COM IVA; subtotal sem IVA depende de isento/não.
  const calc = useMemo(() => {
    let subtotal = 0;
    let totalComIva = 0;
    const itens: ItemFatura[] = [];
    for (const l of linhas) {
      const valorUnit = round2(Number(String(l.valor).replace(',', '.')) || 0);
      const unidades = Math.max(1, Math.floor(Number(l.unidades) || 1));
      const linhaComIva = round2(valorUnit * unidades);
      if (linhaComIva <= 0) continue;
      const taxa = l.isentoIva ? 0 : IVA_PADRAO;
      const linhaSemIva = taxa > 0 ? round2(linhaComIva / (1 + taxa / 100)) : linhaComIva;
      subtotal += linhaSemIva;
      totalComIva += linhaComIva;
      const descricaoFinal = [l.tipo, l.descricao].filter(Boolean).join(' — ') || l.tipo || 'Artigo';
      itens.push({
        descricao: descricaoFinal,
        quantidade: unidades,
        // preço unitário SEM IVA (o provider aplica a taxa)
        preco_unitario: round2(linhaSemIva / unidades),
        taxa_iva: taxa,
      });
    }
    subtotal = round2(subtotal);
    totalComIva = round2(totalComIva);
    const iva = round2(totalComIva - subtotal);
    // Taxa efetiva que reproduz o total com IVA misto (a cobrança guarda 1 taxa).
    const taxaEfetiva = subtotal > 0 ? round2((totalComIva / subtotal - 1) * 100) : 0;
    return { subtotal, iva, totalComIva, taxaEfetiva, itens };
  }, [linhas]);

  const podeCriar = calc.totalComIva > 0 && !!destinatario.id;

  async function abrirDocumentoLocal(numeroDoc: string) {
    let clienteNif: string | null = null;
    let clienteMorada: string | null = null;
    try {
      const { data: cli } = await supabase
        .from('clientes')
        .select('nif, morada, codigo_postal, cidade')
        .eq('id', destinatario.id)
        .single();
      if (cli) {
        clienteNif = (cli as any).nif ?? null;
        clienteMorada =
          [(cli as any).morada, (cli as any).codigo_postal, (cli as any).cidade]
            .filter(Boolean)
            .join(', ') || null;
      }
    } catch {
      /* cabeçalho do cliente é opcional */
    }
    const aberto = openFaturacaoDocumento({
      tipo: tipoDoc === 'fatura_recibo' ? 'fatura_recibo' : 'fatura',
      numero: numeroDoc,
      data: dataDoc,
      emitente: emitente ?? null,
      cliente: { nome: destinatario.nome, nif: clienteNif, morada: clienteMorada },
      linhas: calc.itens.map((it) => ({
        descricao: it.descricao,
        valor: round2(it.preco_unitario * it.quantidade),
      })),
      subtotal: calc.subtotal,
      taxaIva: calc.taxaEfetiva,
      iva: calc.iva,
      total: calc.totalComIva,
      metodoLabel: tipoDoc === 'fatura_recibo' ? metodoLabel(metodo) : null,
    });
    if (!aberto) toast.warning('Pop-up bloqueado — não foi possível abrir o documento local.');
  }

  async function fetchClienteFatura() {
    try {
      const { data } = await supabase
        .from('clientes')
        .select('nome, nif, email, morada, codigo_postal, localidade')
        .eq('id', destinatario.id)
        .single();
      return clienteRowToFatura(data, destinatario.nome);
    } catch {
      return clienteRowToFatura(null, destinatario.nome);
    }
  }

  function reset() {
    setLinhas([novaLinha()]);
    setTipoDoc('fatura');
    setMetodo('transferencia');
    setDataDoc(hoje());
    setDataVenc(maisDias(30));
  }

  async function handleCriar() {
    if (!podeCriar) {
      toast.error('Adicione pelo menos uma linha com valor para criar a fatura.');
      return;
    }
    setSubmitting(true);
    try {
      const tipoLabel = tipoDoc === 'fatura_recibo' ? 'Factura-Recibo' : 'Factura';
      const descricao = `${tipoLabel} — ${alvo.codigoLabel} · Venc: ${dataVenc.split('-').reverse().join('/')}`;
      const emitidaEm = new Date(`${dataDoc}T12:00:00`).toISOString();
      const periodo = dataDoc; // fatura manual: período pontual (data do documento)

      // ── Fase 1 — cobrança manual (fonte de verdade na conta-corrente) ──────
      const { data: cobInserida, error: cobErr } = await supabase
        .from('contrato_cobrancas')
        .insert({
          org_id: alvo.orgId,
          contrato_id: alvo.tipo === 'contrato' ? alvo.id : null,
          reserva_id: alvo.tipo === 'reserva' ? alvo.id : null,
          periodo_de: periodo,
          periodo_ate: periodo,
          descricao,
          destinatario_id: destinatario.id,
          destinatario_papel: 'cliente',
          destinatario_nome: destinatario.nome,
          valor_sem_iva: calc.subtotal,
          taxa_iva: calc.taxaEfetiva,
          emite_fatura_fiscal: true,
          estado: 'emitida',
          emitida_em: emitidaEm,
          manual: true,
        })
        .select('id')
        .single();
      if (cobErr) throw cobErr;
      const cobrancaId: string = cobInserida.id;

      // Factura-Recibo → regista o recibo (liquidação imediata).
      if (tipoDoc === 'fatura_recibo' && calc.totalComIva > 0) {
        const { error: recErr } = await supabase.from('recibos').insert({
          org_id: alvo.orgId,
          entidade_id: destinatario.id,
          contrato_id: alvo.tipo === 'contrato' ? alvo.id : null,
          valor: calc.totalComIva,
          data_recibo: dataDoc,
          metodo,
          estado: 'ativo',
          referencia: cobrancaId,
          observacoes: `Liquidação ${descricao}`,
        });
        if (recErr) throw recErr;
      }

      qc.invalidateQueries({ queryKey: ['contrato-cobrancas', alvo.id] });
      qc.invalidateQueries({ queryKey: ['reserva-cobrancas', alvo.id] });
      qc.invalidateQueries({ queryKey: ['renting'] });

      // ── Fase 2 — emissão fiscal no provider (não reverte a Fase 1) ─────────
      try {
        const cliente = await fetchClienteFatura();
        const res = await emitirMut.mutateAsync({
          payload: {
            tipo: tipoDoc === 'fatura_recibo' ? 'FR' : 'FT',
            cliente,
            itens: calc.itens,
            contrato_id: alvo.tipo === 'contrato' ? alvo.id : undefined,
            cobranca_id: cobrancaId,
            referencia_externa: alvo.codigoLabel,
          },
          cobrancaId,
          contratoId: alvo.id, // só p/ chave de invalidação
        });
        if (res.invoice) {
          try {
            await baixarDocumentoPdf(res.invoice);
          } catch {
            /* download best-effort */
          }
        }
        toast.success(
          `Documento fiscal emitido no ${providerLabel}${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`
        );
        if (res.warning) toast.warning(res.warning);
      } catch (kiErr: any) {
        console.error('Falha a emitir o documento fiscal da nova fatura:', kiErr);
        toast.warning(
          'Fatura registada, mas o documento fiscal ficou por emitir. Pode reemiti-lo na lista de faturas.'
        );
        await abrirDocumentoLocal(descricao);
      }

      onCriada();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error('Erro ao criar nova fatura:', e);
      toast.error(`Erro ao criar fatura: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Nova fatura — {alvo.codigoLabel}
          </DialogTitle>
          <DialogDescription>
            Fatura adicional para {destinatario.nome}. Indique os artigos (preços com IVA incluído).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo + Método + Datas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de documento</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={tipoDoc === 'fatura' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setTipoDoc('fatura')}
                >
                  Factura
                </Button>
                <Button
                  type="button"
                  variant={tipoDoc === 'fatura_recibo' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setTipoDoc('fatura_recibo')}
                >
                  Factura-Recibo
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Método</Label>
                <Select value={metodo} onValueChange={setMetodo}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODO_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data doc.</Label>
                <Input
                  type="date"
                  value={dataDoc}
                  onChange={(e) => setDataDoc(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date"
                  value={dataVenc}
                  onChange={(e) => setDataVenc(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Artigos */}
          <div className="rounded-md border">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Artigos · preços com IVA incluído
              </span>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={addLinha}>
                <Plus className="h-3.5 w-3.5" />
                Inserir linha
              </Button>
            </div>

            {/* Cabeçalho (desktop) */}
            <div className="hidden sm:grid grid-cols-[160px_1fr_110px_70px_70px_36px] gap-2 px-3 py-1.5 text-[11px] font-medium uppercase text-muted-foreground border-b">
              <span>Tipo</span>
              <span>Descrição</span>
              <span className="text-right">Valor (c/ IVA)</span>
              <span className="text-right">Unid.</span>
              <span className="text-center">Isento</span>
              <span />
            </div>

            <div className="divide-y">
              {linhas.map((l) => (
                <div
                  key={l.key}
                  className="grid grid-cols-2 sm:grid-cols-[160px_1fr_110px_70px_70px_36px] gap-2 px-3 py-2 items-center"
                >
                  <Select value={l.tipo} onValueChange={(v) => patchLinha(l.key, { tipo: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Tipo…" />
                    </SelectTrigger>
                    <SelectContent>
                      {FATURA_ARTIGO_TIPOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={l.descricao}
                    onChange={(e) => patchLinha(l.key, { descricao: e.target.value })}
                    placeholder="Descrição"
                    className="h-9 col-span-2 sm:col-span-1"
                  />
                  <Input
                    inputMode="decimal"
                    value={l.valor}
                    onChange={(e) => patchLinha(l.key, { valor: e.target.value })}
                    placeholder="0,00"
                    className="h-9 text-right"
                  />
                  <Input
                    inputMode="numeric"
                    value={l.unidades}
                    onChange={(e) => patchLinha(l.key, { unidades: e.target.value })}
                    className="h-9 text-right"
                  />
                  <div className="flex justify-center">
                    <Checkbox
                      checked={l.isentoIva}
                      onCheckedChange={(c) => patchLinha(l.key, { isentoIva: c === true })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                    onClick={() => removeLinha(l.key)}
                    disabled={linhas.length <= 1}
                    title="Eliminar linha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Somatório */}
          <div className="rounded-md border divide-y text-sm">
            <Row label="Destinatário" value={destinatario.nome} />
            <Row label="Sub-total" value={formatCurrency(calc.subtotal)} />
            <Row label="IVA" value={formatCurrency(calc.iva)} muted />
            <Row label="Total" value={formatCurrency(calc.totalComIva)} total />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleCriar} disabled={submitting || !podeCriar} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  muted,
  total,
}: {
  label: string;
  value: string;
  muted?: boolean;
  total?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span
        className={cn('text-xs', muted ? 'text-muted-foreground' : '', total && 'font-semibold')}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          total ? 'text-base font-bold' : '',
          muted && 'text-muted-foreground text-xs'
        )}
      >
        {value}
      </span>
    </div>
  );
}
