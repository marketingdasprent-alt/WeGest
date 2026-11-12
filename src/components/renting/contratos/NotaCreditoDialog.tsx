import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileMinus } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import { errorMessage } from '@/utils/errorMessage';
import type { EmitResult, FaturacaoDocEmitente, InvoiceMetadata } from '@/types/faturacao';
import {
  emitirDocumento,
  baixarPdfEmSegundoPlano,
  carregarClienteParaFatura,
  consultarDocumentoFiscal,
} from '@/lib/faturacao';
import { DURACAO_AVISO_FALHA_MS, mensagemFalhaEmissao } from '@/lib/faturacaoFalha';
import { avisarTotalDaEmissao } from '@/lib/faturacaoTotal';
import { useOrgDefinicoes } from '@/hooks/useOrgDefinicoes';
import { useDocumentoFiscal } from '@/hooks/useDocumentoFiscal';
import { faturacaoProviderLabel } from '@/lib/faturacaoProviders';
import { semCodigo } from '@/types/codigoPorOrg';

/** Cobrança/fatura-alvo da nota de crédito. */
export interface NotaCreditoCobranca {
  id: string;
  descricao: string | null;
  valor_total: number | null;
  taxa_iva: number | null;
  destinatario_id: string;
  destinatario_nome: string;
  contrato_id: string | null;
  documento_externo_ref: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cobranca: NotaCreditoCobranca | null;
  orgId: string;
  emitente?: FaturacaoDocEmitente | null;
  /** Total já creditado por NC ativas desta cobrança (para o saldo disponível). */
  jaCreditado?: number;
  /** Motivo pré-preenchido (ex.: ao "anular fatura" via NC total). */
  defaultMotivo?: string;
  onEmitida: () => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const hojeISO = () => new Date().toISOString().slice(0, 10);
const MSG_SEM_CONFIRMACAO =
  'Não foi possível confirmar o total da fatura na KeyInvoice; não é possível emitir a nota de crédito.';

export function NotaCreditoDialog({
  open,
  onOpenChange,
  cobranca,
  orgId,
  emitente,
  jaCreditado = 0,
  defaultMotivo,
  onEmitida,
}: Props) {
  const qc = useQueryClient();
  const { data: orgDef, isLoading: orgDefLoading } = useOrgDefinicoes();
  const providerLabel = faturacaoProviderLabel(orgDef?.faturacao_provider);
  // 'na KeyInvoice', mas 'no software de faturação' quando a org não tem fornecedor definido.
  const naOrigem = `${orgDef?.faturacao_provider ? 'na' : 'no'} ${providerLabel}`;
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Trinco síncrono: dois cliques no mesmo tick vêem o mesmo estado e emitiriam duas NC.
  const emitindo = useRef(false);
  // Falha 'unknown': a NC PODE ter sido emitida, por isso só se volta a tentar ao reabrir.
  const [incerta, setIncerta] = useState(false);

  const totalCobranca = round2(cobranca?.valor_total ?? 0);
  const saldoWegest = round2(Math.max(0, totalCobranca - jaCreditado));
  // O documento fiscal pode valer menos que a cobrança (26 FT da Sul, 10/2026): o teto é o menor.
  const fiscalRef = cobranca?.documento_externo_ref ?? null;
  const fiscalQuery = useDocumentoFiscal(fiscalRef, cobranca?.id, orgId, open);
  const fiscal = fiscalQuery.data?.suportado ? fiscalQuery.data : null;
  const aConsultar = open && (orgDefLoading || (!!fiscalRef && fiscalQuery.isFetching));
  const consultaFalhou = !!fiscalRef && !aConsultar && fiscalQuery.isError;
  const saldoDisponivel = fiscal
    ? round2(Math.min(saldoWegest, fiscal.saldoCreditavel))
    : saldoWegest;
  // Falha fechada só com documento fiscal: sem ele não há total no fornecedor que se possa exceder.
  const semConfirmacao =
    !!fiscalRef && !aConsultar && !consultaFalhou && fiscalQuery.data?.suportado === false;
  const taxaIva = cobranca?.taxa_iva ?? 23;
  const docOriginal =
    cobranca?.documento_externo_ref || (cobranca ? cobranca.id.slice(0, 8).toUpperCase() : '—');

  useEffect(() => {
    if (!open) setIncerta(false);
  }, [open]);

  useEffect(() => {
    if (open) setMotivo(defaultMotivo ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cobranca?.id]);

  // Propõe o máximo uma só vez por cobrança, depois da consulta, e nunca por cima do que se escreveu.
  const jaPreenchido = useRef<string | null>(null);
  const campoTocado = useRef(false);
  useEffect(() => {
    if (!open) {
      jaPreenchido.current = null;
      campoTocado.current = false;
      return;
    }
    if (aConsultar || !cobranca || jaPreenchido.current === cobranca.id) return;
    jaPreenchido.current = cobranca.id;
    if (!campoTocado.current) setValor(saldoDisponivel > 0 ? String(saldoDisponivel) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cobranca?.id, aConsultar]);

  const valorNum = round2(parseFloat(valor.replace(',', '.')) || 0);
  const saldoRestante = round2(saldoDisponivel - valorNum);
  const excede = valorNum > saldoDisponivel + 0.005;
  const creditaTudo = valorNum > 0 && !excede && saldoRestante <= 0.005;

  const erro = useMemo(() => {
    if (!cobranca) return 'Sem cobrança selecionada.';
    if (aConsultar) return `A confirmar o total da fatura ${naOrigem}…`;
    if (consultaFalhou) {
      return (
        `Não foi possível confirmar o total da fatura ${naOrigem} ` +
        `(${fiscalQuery.error?.message || 'erro desconhecido'}). Não é possível emitir a nota de crédito.`
      );
    }
    if (semConfirmacao) return MSG_SEM_CONFIRMACAO;
    if (fiscal?.voided) {
      return `A fatura está anulada ${naOrigem}; não é possível emitir a nota de crédito.`;
    }
    if (saldoDisponivel <= 0) return 'Esta cobrança já está totalmente creditada.';
    if (valorNum <= 0) return 'Indique um valor a creditar.';
    if (valorNum > saldoDisponivel + 0.005)
      return `O valor excede o saldo por creditar (${formatCurrency(saldoDisponivel)}).`;
    if (!motivo.trim()) return 'A justificação é obrigatória.';
    return null;
  }, [
    cobranca,
    aConsultar,
    consultaFalhou,
    semConfirmacao,
    fiscal?.voided,
    fiscalQuery.error,
    naOrigem,
    saldoDisponivel,
    valorNum,
    motivo,
  ]);

  function handleOpenChange(aberto: boolean) {
    if (emitindo.current) return;
    onOpenChange(aberto);
  }

  async function handleEmitir() {
    if (emitindo.current) return;
    if (!cobranca || erro) {
      if (erro) toast.error(erro);
      return;
    }
    emitindo.current = true;
    setSubmitting(true);
    // Fora do try: o catch tem de saber se já existe NC no fornecedor.
    let emitiu = false;
    let numeroFiscal: string | null = null;
    let invoice: InvoiceMetadata | undefined;
    const avisoPersistente = (msg: string) =>
      toast.error(msg, {
        duration: Infinity,
        closeButton: true,
        id: `nc-${numeroFiscal ?? cobranca.id}`,
      });
    try {
      // O trigger de notas_credito lança o crédito logo ao inserir, por isso o teto confirma-se
      // aqui, com o saldo de agora e não o de quando o diálogo abriu (reduz a janela de corrida).
      if (cobranca.documento_externo_ref) {
        const fresco = await consultarDocumentoFiscal(
          cobranca.documento_externo_ref,
          cobranca.id
        ).catch((e: unknown) => {
          throw new Error(
            `Não foi possível confirmar o total da fatura ${naOrigem} (${errorMessage(e, 'erro desconhecido')}). Nada foi gravado.`
          );
        });
        if (!fresco.suportado) throw new Error(`${MSG_SEM_CONFIRMACAO} Nada foi gravado.`);
        qc.invalidateQueries({ queryKey: ['documento-fiscal'] });
        const maximo = round2(Math.min(saldoWegest, fresco.saldoCreditavel));
        if (fresco.voided) {
          toast.error(`A fatura está anulada ${naOrigem}. Nada foi gravado.`);
          return;
        }
        if (valorNum > maximo + 0.005) {
          toast.error(
            `O saldo por creditar mudou para ${formatCurrency(maximo)}. Nada foi gravado: ajuste o valor.`
          );
          return;
        }
      }

      // Antes de emitir: se a ficha não lê, falha sem deixar nada emitido nem gravado.
      const cliente = cobranca.documento_externo_ref
        ? await carregarClienteParaFatura(cobranca.destinatario_id, cobranca.destinatario_nome)
        : null;

      // ── Fase 1 — emitir a NC no provider; se recusar, nada é gravado ─────
      if (cliente) {
        const base = round2(valorNum / (1 + taxaIva / 100));
        let res: EmitResult;
        try {
          res = await emitirDocumento({
            tipo: 'NC',
            cliente,
            itens: [
              {
                descricao: `Crédito sobre ${docOriginal} — ${motivo.trim()}`,
                quantidade: 1,
                preco_unitario: base,
                taxa_iva: taxaIva,
              },
            ],
            contrato_id: cobranca.contrato_id,
            cobranca_id: cobranca.id,
            documento_referencia: cobranca.documento_externo_ref,
            referencia_externa: `Crédito sobre ${docOriginal}`,
            observacoes: motivo.trim(),
          });
        } catch (kiErr: unknown) {
          console.error('Falha a emitir a nota de crédito no provider:', kiErr);
          if ((kiErr as { classe?: string } | null)?.classe === 'unknown') setIncerta(true);
          toast.error(mensagemFalhaEmissao(kiErr, 'nota_credito'), {
            duration: DURACAO_AVISO_FALHA_MS,
          });
          return;
        }
        emitiu = true;
        numeroFiscal = res.provider?.FullDocNumber ?? res.invoice?.numero ?? null;
        invoice = res.invoice;
        if (res.localGravado === false) {
          toast.error(
            `A nota de crédito foi emitida ${naOrigem} mas NÃO ficou registada no WeGest. ` +
              'Avise um administrador antes de emitir outra.',
            { duration: DURACAO_AVISO_FALHA_MS }
          );
        } else if (res.warning) {
          toast.warning(res.warning);
        }
        avisarTotalDaEmissao(res);
        if (res.totalDivergente) qc.invalidateQueries({ queryKey: ['faturacao-opcoes'] });
      }

      // ── Fase 2 — registar a nota de crédito (trigger posta o crédito) ────
      // contrato_id é preenchido pelo trigger a partir da cobrança (pode ser uma
      // cobrança de reserva, sem contrato) — por isso não o enviamos aqui.
      const { error } = await supabase
        .from('notas_credito')
        .insert(
          semCodigo<'notas_credito'>({
            org_id: orgId,
            cobranca_id: cobranca.id,
            entidade_id: cobranca.destinatario_id,
            valor: valorNum,
            motivo: motivo.trim(),
            data_nota: hojeISO(),
            estado: 'ativo',
            documento_externo_ref: numeroFiscal,
          })
        )
        .select('id, codigo')
        .single();

      // Só depois do insert e sem esperar: o PDF pode levar dezenas de segundos.
      baixarPdfEmSegundoPlano(invoice, (m) => toast.warning(m));

      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['documento-fiscal'] });
      if (cobranca.contrato_id) {
        qc.invalidateQueries({ queryKey: ['contrato-cobrancas', cobranca.contrato_id] });
        qc.invalidateQueries({ queryKey: ['contrato-notas-credito', cobranca.contrato_id] });
        qc.invalidateQueries({ queryKey: ['invoices-by-contrato', cobranca.contrato_id] });
      } else {
        qc.invalidateQueries({ queryKey: ['reserva-cobrancas'] });
        qc.invalidateQueries({ queryKey: ['reserva-notas-credito'] });
      }

      if (error) {
        console.error('Nota de crédito não gravada no WeGest:', error);
        // Sem isto a NC ficava órfã na KeyInvoice: o aviso fica até alguém o fechar.
        const porque = error.message || 'erro desconhecido';
        if (!emitiu) {
          avisoPersistente(`Não foi possível gravar a nota de crédito: ${porque}.`);
          return;
        }
        avisoPersistente(
          numeroFiscal
            ? `A nota de crédito ${numeroFiscal} foi emitida ${naOrigem} mas NÃO ficou gravada no WeGest ` +
                `(${porque}). Avise o suporte com este número antes de emitir outra.`
            : `Foi emitida uma nota de crédito ${naOrigem} (sem número devolvido) mas NÃO ficou gravada no WeGest ` +
                `(${porque}). Confirme-a ${naOrigem} e avise o suporte antes de emitir outra.`
        );
      } else if (emitiu && !numeroFiscal) {
        avisoPersistente(
          `A nota de crédito foi emitida ${naOrigem} mas o número fiscal não foi devolvido. ` +
            `Confirme-a ${naOrigem} antes de emitir outra.`
        );
      } else {
        toast.success(
          numeroFiscal
            ? `Nota de crédito ${numeroFiscal} emitida ${naOrigem} (${formatCurrency(valorNum)}).`
            : `Crédito de ${formatCurrency(valorNum)} registado na conta-corrente.`
        );
      }

      onEmitida();
      onOpenChange(false);
    } catch (e: unknown) {
      console.error('Erro ao emitir nota de crédito:', e);
      if (emitiu) {
        avisoPersistente(
          `A nota de crédito${numeroFiscal ? ` ${numeroFiscal}` : ''} foi emitida ${naOrigem}, mas ocorreu um erro depois ` +
            `(${errorMessage(e, 'erro desconhecido')}). Confirme-a ${naOrigem} e avise o suporte antes de emitir outra.`
        );
      } else {
        toast.error(`Erro ao emitir nota de crédito: ${errorMessage(e, 'tente novamente')}`);
      }
    } finally {
      emitindo.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-4 border-b bg-card shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileMinus className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-400" />
            Emitir Nota de Crédito
          </DialogTitle>
          <DialogDescription>
            Credita (total ou parcialmente) a fatura {docOriginal}. A fatura original mantém-se; a
            nota de crédito abate-a.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Resumo da cobrança */}
          <div className="rounded-md border divide-y text-sm">
            <Linha label="Documento" value={docOriginal} />
            <Linha label="Total da fatura" value={formatCurrency(totalCobranca)} />
            {jaCreditado > 0 && (
              <Linha label="Já creditado" value={`− ${formatCurrency(jaCreditado)}`} muted />
            )}
            {fiscal ? (
              <>
                <Linha label={`Total ${naOrigem}`} value={formatCurrency(fiscal.totalProvider)} />
                <Linha
                  label={`Já creditado ${naOrigem}`}
                  value={`− ${formatCurrency(fiscal.ncsEmitidas)}`}
                  muted
                />
                <Linha label="Máximo a creditar" value={formatCurrency(saldoDisponivel)} strong />
              </>
            ) : (
              <Linha label="Saldo por creditar" value={formatCurrency(saldoDisponivel)} strong />
            )}
          </div>
          {incerta && (
            <p className="text-xs text-destructive">
              Não se sabe se a nota de crédito foi emitida. Confirme {naOrigem} e reabra esta janela
              antes de tentar de novo.
            </p>
          )}
          {(aConsultar || consultaFalhou || semConfirmacao || fiscal?.voided) && (
            <p
              className={cn(
                'text-xs',
                consultaFalhou || semConfirmacao || fiscal?.voided
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              )}
            >
              {erro}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Valor a creditar</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              max={saldoDisponivel}
              value={valor}
              onChange={(e) => {
                campoTocado.current = true;
                setValor(e.target.value);
              }}
              disabled={saldoDisponivel <= 0 || aConsultar || consultaFalhou || semConfirmacao}
              className="h-9"
            />
            {excede ? (
              <p className="text-[11px] text-destructive">
                O valor excede o saldo por creditar ({formatCurrency(saldoDisponivel)}).
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Máximo {formatCurrency(saldoDisponivel)} (IVA {taxaIva}% incluído).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Justificação</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da nota de crédito (obrigatório)…"
              rows={3}
            />
          </div>

          {/* Diferença / saldo restante */}
          <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Saldo restante após esta nota</span>
            <span
              className={cn(
                'text-base font-bold tabular-nums',
                creditaTudo && 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {formatCurrency(Math.max(0, saldoRestante))}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleEmitir}
            disabled={submitting || !!erro || incerta}
            className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Emitir nota de crédito
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Linha({
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
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn('tabular-nums', strong && 'font-semibold', muted && 'text-muted-foreground')}
      >
        {value}
      </span>
    </div>
  );
}
