/**
 * "Nova Fatura" — fatura ADICIONAL de um contrato ou reserva, com linhas
 * livres (artigos digitados à mão). Permite emitir mais que uma fatura por
 * contrato/reserva.
 *
 * - O campo "Tipo" da linha é uma lista fixa (FATURA_ARTIGO_TIPOS); descrição,
 *   valor e unidades são livres.
 * - O valor inserido é **SEM IVA**. O IVA (23%) é somado por cima, por linha.
 *   O checkbox "Isento" põe a linha a 0% e passa a exigir uma **justificação**
 *   (a lei obriga a indicar o motivo da isenção no documento).
 * - Um bloco de resumo no fundo soma Subtotal → IVA → Total, ao vivo, no mesmo
 *   formato do "Resumo do contrato".
 * - Cria uma cobrança `manual = true` (fora do índice único de período, por
 *   isso convive com a faturação automática) e emite o documento fiscal no
 *   provider configurado. NÃO altera o estado_financeiro do contrato.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Receipt, Plus, Trash2, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  ParcelamentoDialog,
  type ParcelamentoFaturaAlvo,
} from '@/components/faturacao/ParcelamentoDialog';
import { useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { useOrgDefinicoes } from '@/hooks/useOrgDefinicoes';
import { faturacaoProviderLabel } from '@/lib/faturacaoProviders';
import { FATURA_ARTIGO_TIPOS } from '@/lib/faturaArtigoTipos';
import type { ItemFatura } from '@/types/faturacao';
import { semCodigo } from '@/types/codigoPorOrg';

const IVA_PADRAO = 23;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const hoje = () => new Date().toISOString().slice(0, 10);
const maisDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Aceita vírgula decimal (pt-PT) além do ponto. */
const num = (s: string) => Number(String(s).replace(',', '.')) || 0;

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
  /** valor unitário SEM IVA */
  valor: string;
  unidades: string;
  isentoIva: boolean;
  /** Motivo legal da isenção — obrigatório quando `isentoIva`. */
  justificacao: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alvo: NovaFaturaAlvo;
  destinatario: NovaFaturaDestinatario;
  /** Motorista TVDE principal do contrato — dívida cedida na emissão, nunca destinatário fiscal. */
  motoristaEntidade?: NovaFaturaDestinatario | null;
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
  justificacao: '',
});

export function NovaFaturaDialog({
  open,
  onOpenChange,
  alvo,
  destinatario,
  motoristaEntidade,
  emitente,
  onCriada,
}: Props) {
  const qc = useQueryClient();
  const emitirMut = useEmitirEEscreverFatura();
  const { data: orgDef } = useOrgDefinicoes();
  const providerLabel = faturacaoProviderLabel(orgDef?.faturacao_provider);
  const [tipoDoc, setTipoDoc] = useState<'fatura' | 'fatura_recibo'>('fatura');
  // Cessão da dívida ao motorista — a fatura fica sempre em nome de
  // `destinatario` (exigência legal); isto só decide quem fica a dever.
  const [entidade, setEntidade] = useState<'cliente' | 'motorista'>('cliente');
  const [metodo, setMetodo] = useState<string>('transferencia');
  const [dataDoc, setDataDoc] = useState<string>(hoje());
  const [dataVenc, setDataVenc] = useState<string>(maisDias(30));
  const [linhas, setLinhas] = useState<LinhaArtigo[]>([novaLinha()]);
  const [submitting, setSubmitting] = useState(false);
  // Alvo do "Parcelar" oferecido no toast de sucesso — só para faturas de
  // contrato (ParcelamentoFaturaAlvo não suporta reservas, fora de âmbito).
  const [parcelamentoAlvo, setParcelamentoAlvo] = useState<ParcelamentoFaturaAlvo | null>(null);

  function patchLinha(key: string, patch: Partial<LinhaArtigo>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLinha() {
    setLinhas((prev) => [...prev, novaLinha()]);
  }
  function removeLinha(key: string) {
    setLinhas((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  // Valor da linha é SEM IVA; o IVA soma-se por cima (0% se isenta).
  const calc = useMemo(() => {
    let subtotal = 0;
    let totalIva = 0;
    let totalIsento = 0;
    const itens: ItemFatura[] = [];

    for (const l of linhas) {
      const valorUnit = round2(num(l.valor));
      const unidades = Math.max(1, Math.floor(Number(l.unidades) || 1));
      const linhaSemIva = round2(valorUnit * unidades);
      if (linhaSemIva <= 0) continue;

      const taxa = l.isentoIva ? 0 : IVA_PADRAO;
      const linhaIva = round2(linhaSemIva * (taxa / 100));

      subtotal += linhaSemIva;
      totalIva += linhaIva;
      if (l.isentoIva) totalIsento += linhaSemIva;

      const base = [l.tipo, l.descricao].filter(Boolean).join(' — ') || l.tipo || 'Artigo';
      // Sem campo estruturado de isenção no provider, o motivo vai na descrição
      // do artigo para constar do documento fiscal.
      const descricaoFinal =
        l.isentoIva && l.justificacao.trim()
          ? `${base} (Isento de IVA: ${l.justificacao.trim()})`
          : base;

      itens.push({
        descricao: descricaoFinal,
        quantidade: unidades,
        preco_unitario: valorUnit, // já SEM IVA
        taxa_iva: taxa,
      });
    }

    subtotal = round2(subtotal);
    totalIva = round2(totalIva);
    const totalComIva = round2(subtotal + totalIva);
    // Taxa efetiva que reproduz o total (a cobrança guarda uma única taxa).
    const taxaEfetiva = subtotal > 0 ? round2((totalComIva / subtotal - 1) * 100) : 0;
    return {
      subtotal,
      iva: totalIva,
      totalComIva,
      taxaEfetiva,
      itens,
      totalIsento: round2(totalIsento),
    };
  }, [linhas]);

  /** Linhas com valor mas isentas e sem motivo — a lei exige o motivo. */
  const linhasSemJustificacao = useMemo(
    () => linhas.filter((l) => num(l.valor) > 0 && l.isentoIva && !l.justificacao.trim()),
    [linhas]
  );

  const podeCriar = calc.totalComIva > 0 && !!destinatario.id && linhasSemJustificacao.length === 0;

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
    setEntidade('cliente');
  }

  async function handleCriar() {
    if (!podeCriar) {
      if (linhasSemJustificacao.length > 0) {
        toast.error('Indique a justificação da isenção de IVA nas linhas isentas.');
      } else {
        toast.error('Adicione pelo menos uma linha com valor para criar a fatura.');
      }
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

      // Cedência ao motorista — só faz sentido numa Factura normal (uma
      // Factura-Recibo já nasce liquidada, sem dívida nenhuma para ceder;
      // mesmo motivo por que acordo_criar recusa parcelar uma FR). A fatura
      // continua emitida em nome de `destinatario`; isto é só o lançamento
      // interno (ver 20260730170000_cobranca_cessao_motorista_na_emissao.sql).
      // Best-effort: um erro aqui não deve impedir o resto do fluxo.
      if (entidade === 'motorista' && motoristaEntidade && tipoDoc === 'fatura') {
        const { error: cessaoErr } = await supabase.rpc('cobranca_ceder_a_motorista' as any, {
          p_cobranca_id: cobrancaId,
          p_motorista_id: motoristaEntidade.id,
        });
        if (cessaoErr) {
          console.error('Falha a ceder a dívida ao motorista:', cessaoErr);
          toast.warning(
            `Fatura registada, mas não foi possível ceder a dívida ao motorista: ${cessaoErr.message}`
          );
        }
      }

      // Factura-Recibo → regista o recibo (liquidação imediata).
      if (tipoDoc === 'fatura_recibo' && calc.totalComIva > 0) {
        const { error: recErr } = await supabase.from('recibos').insert(
          semCodigo<'recibos'>({
            org_id: alvo.orgId,
            entidade_id: destinatario.id,
            contrato_id: alvo.tipo === 'contrato' ? alvo.id : null,
            valor: calc.totalComIva,
            data_recibo: dataDoc,
            metodo,
            estado: 'ativo',
            referencia: cobrancaId,
            observacoes: `Liquidação ${descricao}`,
          })
        );
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
          `Documento fiscal emitido no ${providerLabel}${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`,
          // "Parcelar" só faz sentido para faturas de contrato (ParcelamentoFaturaAlvo
          // não cobre reservas, fora de âmbito) E quando ainda há saldo por liquidar.
          // Uma Factura-Recibo já foi liquidada de imediato acima (insert em `recibos`,
          // Fase 1) — saldoPagar seria 0 e gerarPlanoParcelas rejeitaria com "o valor a
          // parcelar tem de ser positivo" (mesmo invariante que abrirParcelarParaRow em
          // FaturacaoTab.tsx já impõe: nunca oferecer parcelamento sobre saldo liquidado).
          alvo.tipo === 'contrato' && tipoDoc === 'fatura'
            ? {
                action: {
                  label: 'Parcelar',
                  onClick: () =>
                    setParcelamentoAlvo({
                      cobrancaId,
                      contratoId: alvo.id,
                      numeroDocumento: res.fullDocNumber ?? '',
                      dataDocumento: dataDoc,
                      valorTotal: calc.totalComIva,
                      // Fatura acabada de criar (não Factura-Recibo, excluída acima):
                      // nada foi liquidado ainda — o saldo por parcelar é o total.
                      saldoPagar: calc.totalComIva,
                      titularId: destinatario.id,
                      titularNome: destinatario.nome,
                      titularNif: cliente.nif ?? null,
                    }),
                },
              }
            : undefined
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
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!submitting) onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-4 pb-4 border-b bg-card shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Nova fatura — {alvo.codigoLabel}
            </DialogTitle>
            <DialogDescription>
              Fatura adicional para {destinatario.nome}. Os valores são indicados{' '}
              <strong>sem IVA</strong>; o IVA ({IVA_PADRAO}%) é somado no resumo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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

            {motoristaEntidade && (
              <div className="space-y-1.5">
                <Label className="text-xs">Quem fica a dever</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={entidade === 'cliente' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setEntidade('cliente')}
                  >
                    {destinatario.nome}
                  </Button>
                  <Button
                    type="button"
                    variant={entidade === 'motorista' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    disabled={tipoDoc === 'fatura_recibo'}
                    title={
                      tipoDoc === 'fatura_recibo'
                        ? 'Uma Factura-Recibo já nasce liquidada — não há dívida para ceder.'
                        : undefined
                    }
                    onClick={() => setEntidade('motorista')}
                  >
                    Motorista — {motoristaEntidade.nome}
                  </Button>
                </div>
                {entidade === 'motorista' && tipoDoc === 'fatura' && (
                  <p className="text-[11px] text-muted-foreground rounded-md border p-2 mt-1.5">
                    ⓘ A fatura é emitida em nome de {destinatario.nome}. A dívida passa para a
                    conta-corrente de {motoristaEntidade.nome} — exigência legal: a fatura fiscal
                    fica sempre em nome do cliente.
                  </p>
                )}
              </div>
            )}

            {/* Artigos */}
            <div className="rounded-md border">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Artigos · preços sem IVA
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1"
                  onClick={addLinha}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Inserir linha
                </Button>
              </div>

              {/* Cabeçalho (desktop) */}
              <div className="hidden sm:grid grid-cols-[170px_1fr_120px_70px_70px_110px_36px] gap-2 px-3 py-1.5 text-[11px] font-medium uppercase text-muted-foreground border-b">
                <span>Tipo</span>
                <span>Descrição</span>
                <span className="text-right">Valor (s/ IVA)</span>
                <span className="text-right">Unid.</span>
                <span className="text-center">Isento</span>
                <span className="text-right">Total linha</span>
                <span />
              </div>

              <div className="divide-y">
                {linhas.map((l) => {
                  const valorUnit = round2(num(l.valor));
                  const unidades = Math.max(1, Math.floor(Number(l.unidades) || 1));
                  const linhaSemIva = round2(valorUnit * unidades);
                  const linhaTotal = l.isentoIva
                    ? linhaSemIva
                    : round2(linhaSemIva * (1 + IVA_PADRAO / 100));
                  const faltaMotivo = linhaSemIva > 0 && l.isentoIva && !l.justificacao.trim();

                  return (
                    <div key={l.key} className="px-3 py-2 space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-[170px_1fr_120px_70px_70px_110px_36px] gap-2 items-center">
                        <Select
                          value={l.tipo}
                          onValueChange={(v) => patchLinha(l.key, { tipo: v })}
                        >
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
                            onCheckedChange={(c) =>
                              patchLinha(l.key, {
                                isentoIva: c === true,
                                // Ao desmarcar, limpa o motivo — deixa de fazer sentido.
                                ...(c === true ? {} : { justificacao: '' }),
                              })
                            }
                          />
                        </div>
                        <span className="text-sm text-right tabular-nums text-muted-foreground">
                          {linhaSemIva > 0 ? formatCurrency(linhaTotal) : '—'}
                        </span>
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

                      {/* Justificação da isenção — obrigatória quando a linha é isenta */}
                      {l.isentoIva && (
                        <div className="sm:pl-[178px]">
                          <Input
                            value={l.justificacao}
                            onChange={(e) => patchLinha(l.key, { justificacao: e.target.value })}
                            placeholder="Justificação da isenção de IVA (obrigatório) — ex.: Artigo 9.º do CIVA"
                            className={cn('h-9', faltaMotivo && 'border-destructive')}
                          />
                          {faltaMotivo && (
                            <p className="mt-1 text-[11px] text-destructive">
                              A lei obriga a indicar o motivo da isenção.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Resumo — sempre visível, soma ao vivo */}
          <div className="border-t bg-muted/20 px-6 py-3 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="space-y-1 text-sm min-w-[240px]">
                <ResumoRow label="Subtotal (s/ IVA)" value={formatCurrency(calc.subtotal)} />
                {calc.totalIsento > 0 && (
                  <ResumoRow
                    label="Do qual isento"
                    value={formatCurrency(calc.totalIsento)}
                    muted
                  />
                )}
                <ResumoRow label={`IVA (${IVA_PADRAO}%)`} value={formatCurrency(calc.iva)} muted />
                <div className="border-t border-border/60 my-1" />
                <ResumoRow label="Total" value={formatCurrency(calc.totalComIva)} strong />
              </div>

              <div className="rounded-md bg-background border px-4 py-2 text-center min-w-[180px]">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {formatCurrency(calc.totalComIva)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">IVA incluído</div>
              </div>
            </div>

            {linhasSemJustificacao.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Há {linhasSemJustificacao.length} linha(s) isenta(s) sem justificação.
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleCriar} disabled={submitting || !podeCriar} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ParcelamentoDialog
        open={!!parcelamentoAlvo}
        onOpenChange={(o) => {
          if (!o) setParcelamentoAlvo(null);
        }}
        alvo={parcelamentoAlvo}
        onCriado={() => {
          setParcelamentoAlvo(null);
          onCriada();
        }}
      />
    </>
  );
}

function ResumoRow({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className={cn('text-xs', muted ? 'text-muted-foreground' : 'text-foreground')}>
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          strong ? 'text-base font-bold text-foreground' : 'text-sm text-foreground',
          muted && 'text-muted-foreground text-xs'
        )}
      >
        {value}
      </span>
    </div>
  );
}
