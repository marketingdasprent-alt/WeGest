import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Receipt,
  Lock,
  FileText,
  Download,
  Loader2,
  Send,
  RotateCcw,
  Mail,
  CalendarClock,
  Eye,
  HandCoins,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { useContratoCoberturas } from '@/hooks/useContratoCoberturas';
import { useContratoExtras, calcExtraTotal } from '@/hooks/useContratoExtras';
import { useContratoTaxas, calcTaxaValor } from '@/hooks/useContratoTaxas';
import { useContratoCondutores } from '@/hooks/useContratoCondutores';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { useInvoicesByContrato, useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { baixarDocumentoPdf, clienteRowToFatura, anularCobrancasFaturacao } from '@/lib/faturacao';
import { DocumentoPreviewDialog } from '@/components/faturacao/acordo/DocumentoPreviewDialog';
import { estadoCobrancaDisplay } from '@/lib/estadoCobranca';
import type { InvoiceMetadata, ItemFatura } from '@/types/faturacao';
import type { ContratoRenting } from '@/types/contratoRenting';
import type { FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
import {
  ContratoFaturarDialog,
  type FaturaCalculo,
  type EntidadeOption,
} from './ContratoFaturarDialog';
import {
  FaturacaoActionsToolbar,
  type ToolbarCobranca,
} from '@/components/faturacao/FaturacaoActionsToolbar';
import { NovaFaturaDialog } from '@/components/faturacao/NovaFaturaDialog';
import { EnviarDocumentoEmailDialog } from '@/components/faturacao/EnviarDocumentoEmailDialog';
import { DocumentosEmitidosExtra } from '@/components/faturacao/DocumentosEmitidosExtra';
import {
  ParcelamentoDialog,
  type ParcelamentoFaturaAlvo,
} from '@/components/faturacao/ParcelamentoDialog';
import { useContactosDocumento } from '@/hooks/useContactosDocumento';
import {
  useAcordoAtivoPorCobranca,
  useAcordosAtivosPorCobrancas,
} from '@/hooks/useAcordosPagamento';

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Dias entre datas (ceil; 1d+1h = 2 dias) — espelha public.fn_contrato_dias(). */
function calcDias(inicio?: string | null, fim?: string | null): number {
  if (!inicio || !fim) return 0;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}

// Estado mostrado (inclui "Creditada" quando as NCs cobrem a fatura toda) —
// ver src/lib/estadoCobranca.ts para o porquê de não se usar "Anulada".

interface CobrancaRow {
  id: string;
  documento_externo_ref: string | null;
  estado: string;
  valor_total: number | null;
  valor_sem_iva: number | null;
  taxa_iva: number | null;
  emite_fatura_fiscal: boolean;
  emitida_em: string | null;
  created_at: string;
  descricao: string | null;
  destinatario_id: string;
  destinatario_nome: string;
}

interface Props {
  contrato: ContratoRenting;
}

export function ContratoTabFaturar({ contrato }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [reemitindoId, setReemitindoId] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [anularOpen, setAnularOpen] = useState(false);
  const [anularBusy, setAnularBusy] = useState(false);
  // Um contrato pode ter várias cobranças ativas (ciclos de faturação
  // diferentes) — "Anular faturação" anulava todas de vez, sem escolha
  // nenhuma (achado ao testar manualmente). Pré-selecionadas todas ao abrir,
  // para o comportamento antigo continuar a ser o valor por omissão.
  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<Set<string>>(new Set());
  const [enviarInvoice, setEnviarInvoice] = useState<InvoiceMetadata | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Fecha a janela anterior se houver duplo-clique antes do preview anterior
  // resolver — mesmo motivo do fix equivalente em AcordoDetalhePanel.tsx.
  const [previewWindow, setPreviewWindow] = useState<Window | null>(null);
  const [parcelamentoAlvo, setParcelamentoAlvo] = useState<ParcelamentoFaturaAlvo | null>(null);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const { data: coberturas } = useContratoCoberturas(contrato.id);
  const { data: extras } = useContratoExtras(contrato.id);
  const { data: taxas } = useContratoTaxas(contrato.id);
  const { data: condutores } = useContratoCondutores(contrato.id);
  const { empresas } = useClientesEmpresas();

  // Emitente do cabeçalho do documento: só é inequívoco quando a org tem
  // exatamente uma empresa. Com várias (ou nenhuma) fica sem cabeçalho de emitente.
  const emitente: FaturacaoDocEmitente | null = useMemo(() => {
    if (empresas.length === 1) {
      const e = empresas[0];
      return { nomeCompleto: e.nomeCompleto, nif: e.nif, sede: e.sede };
    }
    return null;
  }, [empresas]);

  const principal = useMemo(
    () => (condutores ?? []).find((c) => c.is_principal && c.cliente_id) ?? null,
    [condutores]
  );

  // Condutor principal (cliente OU motorista) — para pré-preencher o envio por email.
  const principalCond = useMemo(
    () => (condutores ?? []).find((c) => c.is_principal) ?? null,
    [condutores]
  );
  const { data: contactosEnvio = [] } = useContactosDocumento({
    clienteId: contrato.cliente_id,
    condutor: principalCond
      ? { cliente_id: principalCond.cliente_id, motorista_id: principalCond.motorista_id }
      : null,
  });

  const idsClientes = useMemo(() => {
    const ids = [contrato.cliente_id, principal?.cliente_id].filter(Boolean) as string[];
    return Array.from(new Set(ids));
  }, [contrato.cliente_id, principal]);

  const { data: clientesNomes } = useQuery({
    queryKey: ['faturar-clientes-nomes', idsClientes.slice().sort().join(',')],
    queryFn: async () => {
      if (!idsClientes.length) return {} as Record<string, string>;
      const { data } = await supabase.from('clientes').select('id, nome').in('id', idsClientes);
      const m: Record<string, string> = {};
      (data ?? []).forEach((c: any) => (m[c.id] = c.nome));
      return m;
    },
    enabled: idsClientes.length > 0,
  });

  const { data: cobrancas, refetch: refetchCobrancas } = useQuery({
    queryKey: ['contrato-cobrancas', contrato.id],
    queryFn: async (): Promise<CobrancaRow[]> => {
      const { data, error } = await supabase
        .from('contrato_cobrancas')
        .select(
          'id, documento_externo_ref, estado, valor_total, valor_sem_iva, taxa_iva, emite_fatura_fiscal, emitida_em, created_at, descricao, destinatario_id, destinatario_nome'
        )
        .eq('contrato_id', contrato.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CobrancaRow[];
    },
  });

  // Total já creditado (NC ativas) por cobrança — para o saldo e o botão de NC.
  const { data: ncPorCobranca, refetch: refetchNC } = useQuery({
    queryKey: ['contrato-notas-credito', contrato.id],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('notas_credito')
        .select('cobranca_id, valor')
        .eq('contrato_id', contrato.id)
        .eq('estado', 'ativo');
      if (error) {
        // a tabela pode ainda não estar na BD — não partir a aba
        console.warn('notas_credito indisponível:', error.message);
        return {};
      }
      const m: Record<string, number> = {};
      (data ?? []).forEach((n: any) => {
        m[n.cobranca_id] = (m[n.cobranca_id] ?? 0) + Number(n.valor || 0);
      });
      return m;
    },
  });

  // Total já liquidado (recibos ativos) por cobrança — para o saldo a pagar.
  const { data: recibosPorCobranca, refetch: refetchRecibos } = useQuery({
    queryKey: ['contrato-recibos', contrato.id],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('recibos')
        .select('referencia, valor')
        .eq('contrato_id', contrato.id)
        .eq('estado', 'ativo');
      if (error) {
        console.warn('recibos indisponível:', error.message);
        return {};
      }
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (r.referencia) m[r.referencia] = (m[r.referencia] ?? 0) + Number(r.valor || 0);
      });
      return m;
    },
  });

  const { data: invoices = [], refetch: refetchInvoices } = useInvoicesByContrato(contrato.id);
  const emitirMut = useEmitirEEscreverFatura();

  // Documentos (NC/RC) ligados às cobranças do contrato — o RC pode não ter
  // contrato_id preenchido, por isso procuramos também por cobranca_id.
  const cobrancaIds = useMemo(() => (cobrancas ?? []).map((c) => c.id), [cobrancas]);
  const { data: invoicesExtra = [], refetch: refetchInvoicesExtra } = useQuery({
    queryKey: ['contrato-invoices-cobrancas', contrato.id, cobrancaIds.slice().sort().join(',')],
    enabled: cobrancaIds.length > 0,
    queryFn: async (): Promise<InvoiceMetadata[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .in('cobranca_id', cobrancaIds);
      if (error) {
        console.warn('invoices por cobrança indisponíveis:', error.message);
        return [];
      }
      return (data ?? []) as unknown as InvoiceMetadata[];
    },
  });

  const refetchAll = () => {
    refetchCobrancas();
    refetchNC();
    refetchRecibos();
    refetchInvoices();
    refetchInvoicesExtra();
  };

  // Pode anular se o contrato está facturado/pago, OU se há cobranças activas
  // (cobre o edge-case de um FR em que o recibo falhou a meio: contrato fica
  // pendente mas a cobrança ficou emitida — o botão precisa de aparecer na mesma).
  const temCobrancasAtivas = (cobrancas ?? []).some(
    (c) => c.estado === 'emitida' || c.estado === 'paga'
  );
  const podeAnularFaturacao =
    contrato.estado_financeiro === 'facturado' ||
    contrato.estado_financeiro === 'pago' ||
    temCobrancasAtivas;

  // Para avisar, linha a linha, na checklist de anulação: anular uma cobrança
  // com um acordo de pagamento ativo também cancela esse acordo (ver
  // anularCobrancasFaturacao) — o utilizador precisa de saber isto ANTES de
  // confirmar, não descobrir depois de já ter acontecido.
  const cobrancasAtivasIds = useMemo(
    () =>
      (cobrancas ?? [])
        .filter((c) => c.estado === 'emitida' || c.estado === 'paga')
        .map((c) => c.id),
    [cobrancas]
  );
  const { data: acordosAtivosPorCobranca } = useAcordosAtivosPorCobrancas(cobrancasAtivasIds);

  /**
   * Anula a faturação do contrato → volta a "não faturado" (Pendente), re-faturável.
   * Desfaz tudo o que a faturação criou na conta-corrente: anula recibos e notas de
   * crédito ativos (estornos a débito) e a(s) cobrança(s) (estorno a crédito) — os
   * estornos cancelam-se entre si, deixando o saldo a zero. NÃO emite Nota de Crédito
   * nem cancela o documento fiscal no provider (isso, se necessário, é manual).
   */
  async function anularFaturacao() {
    setAnularBusy(true);
    try {
      const ativasIds = (cobrancas ?? [])
        .filter((c) => c.estado === 'emitida' || c.estado === 'paga')
        .map((c) => c.id);
      const idsParaAnular = ativasIds.filter((id) => cobrancasSelecionadas.has(id));
      if (!idsParaAnular.length) {
        toast.error('Seleciona pelo menos uma fatura para anular.');
        return;
      }
      await anularCobrancasFaturacao(idsParaAnular);

      // Só repõe o contrato a "não faturado" (limpa o snapshot de totais
      // congelado) se NÃO sobrar nenhuma cobrança ativa — anular só ALGUMAS
      // (ex.: um ciclo de faturação a mais, mantendo os restantes) não pode
      // apagar o estado financeiro de cobranças que continuam válidas.
      const sobraAlgumaAtiva = ativasIds.some((id) => !idsParaAnular.includes(id));
      if (!sobraAlgumaAtiva) {
        const { error: upErr } = await supabase
          .from('contratos_renting')
          .update({
            estado_financeiro: 'pendente',
            facturado_em: null,
            total_subtotal: null,
            total_iva: null,
            total_final: null,
          })
          .eq('id', contrato.id);
        if (upErr) throw upErr;
      }

      toast.success(
        idsParaAnular.length === ativasIds.length
          ? 'Faturação anulada — o contrato voltou a "não faturado".'
          : `${idsParaAnular.length} fatura(s) anulada(s).`
      );
      setAnularOpen(false);
      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['contrato-historico', contrato.id] });
      refetchAll();
    } catch (e: any) {
      console.error('Erro ao anular faturação:', e);
      toast.error(`Erro ao anular faturação: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setAnularBusy(false);
    }
  }

  // Última fatura fiscal (FT/FR emitida) por cobrança — p/ download do PDF.
  // A `invoices` é 1-para-N por cobrança (uma FT + eventuais NC partilham cobranca_id).
  const invoiceByCobranca = useMemo(() => {
    const m = new Map<string, InvoiceMetadata>();
    for (const inv of invoices) {
      if (!inv.cobranca_id || inv.status !== 'emitida') continue;
      if (inv.tipo !== 'FT' && inv.tipo !== 'FR') continue;
      const prev = m.get(inv.cobranca_id);
      if (!prev || (inv.created_at ?? '') > (prev.created_at ?? '')) m.set(inv.cobranca_id, inv);
    }
    return m;
  }, [invoices]);

  async function baixarPdf(inv: InvoiceMetadata) {
    setBaixandoId(inv.cobranca_id ?? inv.id);
    try {
      await baixarDocumentoPdf(inv);
    } catch (e: any) {
      toast.error(`Erro ao obter PDF: ${e?.message ?? 'indisponível'}`);
    } finally {
      setBaixandoId(null);
    }
  }

  /** Emite (ou reemite) o documento fiscal de uma cobrança que ficou "por emitir". */
  async function reemitirFatura(c: CobrancaRow) {
    setReemitindoId(c.id);
    try {
      // Reconfirmar p/ não duplicar o documento fiscal (idempotência).
      const { data: fresh, error: fErr } = await supabase
        .from('contrato_cobrancas')
        .select('documento_externo_ref')
        .eq('id', c.id)
        .single();
      if (fErr) throw fErr;
      if (fresh?.documento_externo_ref) {
        toast.info('Esta fatura já tem documento fiscal emitido.');
        refetchCobrancas();
        return;
      }
      const { data: cli } = await supabase
        .from('clientes')
        .select('nome, nif, email, morada, codigo_postal, localidade')
        .eq('id', c.destinatario_id)
        .single();
      const isFR = /^fa[c]?tura-recibo/i.test((c.descricao ?? '').trim());
      const codigoLabel = `Contrato #${String(contrato.codigo).padStart(4, '0')}`;
      const itens: ItemFatura[] = [
        {
          descricao: `Aluguer — ${codigoLabel}`,
          quantidade: 1,
          preco_unitario: c.valor_sem_iva ?? 0,
          taxa_iva: c.taxa_iva ?? 0,
        },
      ];
      const res = await emitirMut.mutateAsync({
        payload: {
          tipo: isFR ? 'FR' : 'FT',
          cliente: clienteRowToFatura(cli, c.destinatario_nome),
          itens,
          contrato_id: contrato.id,
          cobranca_id: c.id,
          referencia_externa: codigoLabel,
        },
        cobrancaId: c.id,
        contratoId: contrato.id,
      });
      if (res.invoice) {
        try {
          await baixarDocumentoPdf(res.invoice);
        } catch {
          /* download é best-effort */
        }
      }
      toast.success(
        `Documento fiscal emitido${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`
      );
      if (res.warning) toast.warning(res.warning);
      refetchCobrancas();
      refetchInvoices();
    } catch (e: any) {
      console.error('Erro a reemitir documento fiscal:', e);
      toast.error(`Falha a emitir o documento fiscal: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setReemitindoId(null);
    }
  }

  const fatura: FaturaCalculo = useMemo(() => {
    const dias = calcDias(contrato.data_inicio, contrato.data_fim);
    const manual = contrato.valor_total_manual != null && contrato.valor_total_manual > 0;
    const baseAluguer = manual
      ? contrato.valor_total_manual!
      : (contrato.tarifa_diaria ?? 0) * dias;

    const itens: FaturaCalculo['itens'] = [
      {
        descricao: manual
          ? 'Aluguer (valor manual)'
          : `Aluguer${dias ? ` (${dias} dia${dias !== 1 ? 's' : ''})` : ''}`,
        valor: round2(baseAluguer),
      },
    ];

    let custoCoberturas = 0;
    (coberturas ?? []).forEach((c) => {
      const v = (c.preco_dia ?? 0) * dias;
      custoCoberturas += v;
      itens.push({ descricao: `Cobertura: ${c.cobertura_nome}`, valor: round2(v) });
    });

    let custoExtras = 0;
    (extras ?? []).forEach((e) => {
      const v = calcExtraTotal(e as any, dias);
      custoExtras += v;
      itens.push({ descricao: `Extra: ${e.extra_nome}`, valor: round2(v) });
    });

    const subtotalBruto = baseAluguer + custoCoberturas + custoExtras;
    const descPct = contrato.desconto_percentagem ?? 0;
    const desconto = subtotalBruto * (descPct / 100);
    if (desconto > 0) itens.push({ descricao: `Desconto (${descPct}%)`, valor: -round2(desconto) });

    // Rent-a-Car: o preço da tarifa é SEM IVA — soma-se por cima. TVDE/slot:
    // o preço já vem com IVA incluído — decompõe-se (divide), nunca soma
    // (duplicaria o imposto). Mesma lógica que a view contrato_renting_totais
    // e o trigger de congelamento usam.
    const isRentACar = contrato.regime === 'rent_a_car';
    const taxaIva = contrato.taxa_iva ?? (contrato.regime === 'tvde' ? 6 : 23);
    const subtotalBrutoComDesconto = subtotalBruto - desconto;
    let subtotal: number;
    let iva: number;
    let totalComIva: number;
    if (isRentACar) {
      subtotal = subtotalBrutoComDesconto;
      iva = taxaIva > 0 ? subtotal * (taxaIva / 100) : 0;
      totalComIva = subtotal + iva;
    } else {
      totalComIva = subtotalBrutoComDesconto;
      subtotal = taxaIva > 0 ? totalComIva / (1 + taxaIva / 100) : totalComIva;
      iva = totalComIva - subtotal;
    }

    const taxasItens: FaturaCalculo['taxasItens'] = [];
    let custoTaxas = 0;
    (taxas ?? []).forEach((t) => {
      const v = calcTaxaValor(t as any, totalComIva);
      custoTaxas += v;
      taxasItens.push({ descricao: `Taxa: ${t.taxa_nome}`, valor: round2(v) });
    });

    const subtotalR = round2(subtotal);
    const ivaR = round2(iva);
    const custoTaxasR = round2(custoTaxas);
    return {
      dias,
      itens,
      subtotal: subtotalR,
      iva: ivaR,
      taxasItens,
      custoTaxas: custoTaxasR,
      total: round2(totalComIva + custoTaxasR),
      // movimento WeGest = valor cobrado pelo aluguer (já com IVA) — sem duplicar o imposto
      valorRegistado: round2(totalComIva),
      taxaIva,
    };
  }, [contrato, coberturas, extras, taxas]);

  const clienteEntidade: EntidadeOption = {
    id: contrato.cliente_id,
    nome: clientesNomes?.[contrato.cliente_id] || 'Cliente do contrato',
  };
  const condutorEntidade: EntidadeOption | null = principal?.cliente_id
    ? {
        id: principal.cliente_id,
        nome: clientesNomes?.[principal.cliente_id] || 'Condutor principal',
        contratoCondutorId: principal.id,
      }
    : null;

  const jaFacturado = contrato.estado_financeiro !== 'pendente';

  // Cobranças com saldos pré-computados — alvo de recibo / nota de crédito na toolbar.
  const toolbarCobrancas: ToolbarCobranca[] = useMemo(
    () =>
      (cobrancas ?? []).map((c) => {
        const total = round2(c.valor_total ?? 0);
        const creditado = round2(ncPorCobranca?.[c.id] ?? 0);
        const pago = round2(recibosPorCobranca?.[c.id] ?? 0);
        return {
          id: c.id,
          descricao: c.descricao,
          valor_total: c.valor_total,
          taxa_iva: c.taxa_iva,
          destinatario_id: c.destinatario_id,
          destinatario_nome: c.destinatario_nome,
          contrato_id: contrato.id,
          documento_externo_ref: c.documento_externo_ref,
          emite_fatura_fiscal: c.emite_fatura_fiscal,
          estado: c.estado,
          saldoPagar: round2(total - pago - creditado),
          saldoCreditar: round2(total - creditado),
          jaCreditado: creditado,
        };
      }),
    [cobrancas, ncPorCobranca, recibosPorCobranca, contrato.id]
  );

  const cobrancasVisiveis = useMemo(() => {
    const list = (cobrancas ?? []).filter((c) => c.estado !== 'anulada');
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'documento_externo_ref') {
        va = a.documento_externo_ref || '';
        vb = b.documento_externo_ref || '';
      } else if (sortField === 'destinatario_nome') {
        va = a.destinatario_nome || '';
        vb = b.destinatario_nome || '';
      } else if (sortField === 'valor_total') {
        va = a.valor_total || 0;
        vb = b.valor_total || 0;
      } else if (sortField === 'estado') {
        va = a.estado || '';
        vb = b.estado || '';
      } else if (sortField === 'created_at') {
        va = a.emitida_em || a.created_at || '';
        vb = b.emitida_em || b.created_at || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [cobrancas, sortField, sortDir]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn('p-2 rounded-lg', jaFacturado ? 'bg-indigo-500/10' : 'bg-primary/10')}
            >
              {jaFacturado ? (
                <Lock className="h-5 w-5 text-indigo-500" />
              ) : (
                <Receipt className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              {jaFacturado ? (
                <>
                  <p className="text-sm font-medium">
                    Contrato {contrato.estado_financeiro === 'pago' ? 'pago' : 'facturado'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {contrato.facturado_em
                      ? `Facturado em ${formatDate(contrato.facturado_em)}`
                      : 'Os totais estão congelados.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Faturar este contrato</p>
                  <p className="text-xs text-muted-foreground">
                    Total a faturar:{' '}
                    <span className="font-semibold">{formatCurrency(fatura.valorRegistado)}</span>
                    {fatura.dias > 0 ? ` · ${fatura.dias} dia${fatura.dias !== 1 ? 's' : ''}` : ''}
                  </p>
                </>
              )}
              {podeAnularFaturacao && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                  onClick={() => {
                    setCobrancasSelecionadas(
                      new Set(
                        (cobrancas ?? [])
                          .filter((c) => c.estado === 'emitida' || c.estado === 'paga')
                          .map((c) => c.id)
                      )
                    );
                    setAnularOpen(true);
                  }}
                  disabled={anularBusy}
                >
                  {anularBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Anular faturação
                </Button>
              )}
            </div>
          </div>
          <FaturacaoActionsToolbar
            orgId={contrato.org_id}
            emitente={emitente}
            onFaturar={jaFacturado ? undefined : () => setDialogOpen(true)}
            faturarLabel="Faturar contrato"
            onNovaFatura={() => setNovaFaturaOpen(true)}
            cobrancas={toolbarCobrancas}
            onChanged={refetchAll}
          />
        </CardContent>
      </Card>

      {/* Faturas/cobranças deste contrato */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Faturas do contrato
        </p>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  field="documento_externo_ref"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Nº / Ref.
                </SortableTableHead>
                <SortableTableHead
                  field="destinatario_nome"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Destinatário
                </SortableTableHead>
                <SortableTableHead
                  field="valor_total"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                >
                  Total
                </SortableTableHead>
                <SortableTableHead
                  field="estado"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Estado
                </SortableTableHead>
                <SortableTableHead
                  field="created_at"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Data
                </SortableTableHead>
                <TableHead className="text-right">Nota de Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const visiveis = cobrancasVisiveis;
                if (visiveis.length === 0)
                  return (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-20 text-center text-muted-foreground text-sm"
                      >
                        Ainda sem faturas para este contrato.
                      </TableCell>
                    </TableRow>
                  );
                return visiveis.map((c) => {
                  const creditado = round2(ncPorCobranca?.[c.id] ?? 0);
                  const saldo = round2((c.valor_total ?? 0) - creditado);
                  // Saldo por liquidar (p/ gate + seed do ParcelamentoDialog) — MESMA fórmula
                  // que toolbarCobrancas usa para `saldoPagar`: total − recibos ativos − NC ativas.
                  const pago = round2(recibosPorCobranca?.[c.id] ?? 0);
                  const saldoPagar = round2((c.valor_total ?? 0) - pago - creditado);
                  const inv = invoiceByCobranca.get(c.id);
                  const porEmitir =
                    !c.documento_externo_ref &&
                    c.emite_fatura_fiscal &&
                    (c.estado === 'emitida' || c.estado === 'paga') &&
                    (c.valor_total ?? 0) > 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {c.documento_externo_ref ? (
                          <div className="flex items-center gap-1.5">
                            <span>{c.documento_externo_ref}</span>
                            {inv && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  title="Ver documento"
                                  onClick={() => {
                                    // Janela aberta SINCRONAMENTE dentro do clique — ver
                                    // comentário em DocumentoPreviewDialog.tsx sobre o
                                    // popup-blocker do Safari.
                                    const win = window.open('', '_blank');
                                    setPreviewWindow((prev) => {
                                      prev?.close();
                                      return win;
                                    });
                                    setPreviewInvoiceId(inv.id);
                                    setPreviewOpen(true);
                                  }}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  title="Descarregar PDF"
                                  onClick={() => baixarPdf(inv)}
                                  disabled={baixandoId === c.id}
                                >
                                  {baixandoId === c.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  title="Enviar por email"
                                  onClick={() => setEnviarInvoice(inv)}
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                </Button>
                                <AcaoParcelar
                                  cobranca={c}
                                  contratoId={contrato.id}
                                  invoice={inv}
                                  saldoPagar={saldoPagar}
                                  onAbrir={setParcelamentoAlvo}
                                />
                              </>
                            )}
                          </div>
                        ) : porEmitir ? (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            >
                              Por emitir
                            </Badge>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1"
                              onClick={() => reemitirFatura(c)}
                              disabled={reemitindoId === c.id}
                            >
                              {reemitindoId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Reemitir
                            </Button>
                          </div>
                        ) : (
                          c.id.slice(0, 8).toUpperCase()
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={c.destinatario_nome}>
                        {c.destinatario_nome}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(c.valor_total)}
                        {creditado > 0 && (
                          <span className="block text-[11px] font-normal text-fuchsia-600 dark:text-fuchsia-400">
                            − {formatCurrency(creditado)} creditado
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const est = estadoCobrancaDisplay(c.estado, c.valor_total, creditado);
                          return (
                            <Badge
                              variant="outline"
                              className={cn('capitalize border', est.className)}
                              title={
                                est.totalmenteCreditada
                                  ? 'Fatura integralmente regularizada por nota(s) de crédito. A fatura mantém-se emitida para efeitos fiscais.'
                                  : undefined
                              }
                            >
                              {est.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(c.emitida_em || c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {creditado > 0 ? (
                          <span className="text-xs text-fuchsia-600 dark:text-fuchsia-400">
                            {saldo <= 0.005 ? 'Creditada' : 'Parcial'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </div>
      </div>

      <DocumentosEmitidosExtra invoices={invoicesExtra} onEnviar={setEnviarInvoice} />

      <DocumentoPreviewDialog
        open={previewOpen}
        onOpenChange={(o) => {
          setPreviewOpen(o);
          if (!o) {
            setPreviewInvoiceId(null);
            setPreviewWindow(null);
          }
        }}
        invoiceId={previewInvoiceId}
        previewWindow={previewWindow}
      />

      <ContratoFaturarDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contrato={contrato}
        fatura={fatura}
        clienteEntidade={clienteEntidade}
        condutorEntidade={condutorEntidade}
        emitente={emitente}
        onFaturado={refetchAll}
      />

      <NovaFaturaDialog
        open={novaFaturaOpen}
        onOpenChange={setNovaFaturaOpen}
        alvo={{
          tipo: 'contrato',
          id: contrato.id,
          orgId: contrato.org_id,
          codigoLabel: `Contrato #${String(contrato.codigo).padStart(4, '0')}`,
        }}
        destinatario={clienteEntidade}
        emitente={emitente}
        onCriada={refetchAll}
      />

      <EnviarDocumentoEmailDialog
        open={!!enviarInvoice}
        onOpenChange={(o) => {
          if (!o) setEnviarInvoice(null);
        }}
        invoice={enviarInvoice}
        contextoLabel={`Contrato #${String(contrato.codigo).padStart(4, '0')}`}
        entidades={contactosEnvio}
      />

      <ParcelamentoDialog
        open={!!parcelamentoAlvo}
        onOpenChange={(o) => {
          if (!o) setParcelamentoAlvo(null);
        }}
        alvo={parcelamentoAlvo}
        onCriado={refetchAll}
      />

      <AlertDialog
        open={anularOpen}
        onOpenChange={(o) => {
          if (!o && !anularBusy) setAnularOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular a faturação deste contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolhe abaixo quais faturas anular — um contrato pode ter várias cobranças ativas
              (ciclos de faturação diferentes). Os lançamentos na conta-corrente das selecionadas
              (cobrança, recibos e notas de crédito) são estornados — o saldo fica a zero. Se
              anulares todas, o contrato volta a <b>"não faturado"</b> e fica re-faturável. Esta
              ação <b>não</b> emite Nota de Crédito nem cancela o documento fiscal no software de
              faturação; se já tiver sido emitido um documento certificado, faça a reversão fiscal
              (NC) separadamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-md border p-2">
            {(cobrancas ?? [])
              .filter((c) => c.estado === 'emitida' || c.estado === 'paga')
              .map((c) => {
                const checked = cobrancasSelecionadas.has(c.id);
                const acordoAtivo = acordosAtivosPorCobranca?.get(c.id);
                return (
                  <div key={c.id} className="rounded px-1.5 py-1 hover:bg-muted/50">
                    <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={checked}
                        disabled={anularBusy}
                        onCheckedChange={(v) => {
                          setCobrancasSelecionadas((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                      <span className="font-mono text-xs">
                        {c.documento_externo_ref || c.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span
                        className="text-muted-foreground truncate flex-1"
                        title={c.destinatario_nome}
                      >
                        {c.destinatario_nome}
                      </span>
                      <span className="font-medium whitespace-nowrap">
                        {formatCurrency(c.valor_total)}
                      </span>
                    </label>
                    {acordoAtivo && (
                      <p className="pl-7 text-[11px] text-amber-700 dark:text-amber-400">
                        ⚠ Tem um acordo de pagamento ativo (ACD-{acordoAtivo.codigo}) — também será
                        cancelado.
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={anularBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                anularFaturacao();
              }}
              disabled={anularBusy || cobrancasSelecionadas.size === 0}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {anularBusy
                ? 'A anular…'
                : `Anular ${cobrancasSelecionadas.size || ''} fatura${cobrancasSelecionadas.size === 1 ? '' : 's'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Ícone "Parcelar fatura" — célula própria porque `useAcordoAtivoPorCobranca` é um
 * hook e não pode ser chamado condicionalmente dentro do `.map()` da tabela.
 */
function AcaoParcelar({
  cobranca,
  contratoId,
  invoice,
  saldoPagar,
  onAbrir,
}: {
  cobranca: CobrancaRow;
  contratoId: string;
  invoice: InvoiceMetadata;
  /**
   * valor_total − recibos ativos − NC ativas, calculado pelo chamador com a mesma
   * fórmula de `toolbarCobrancas` — nunca recalcular aqui a partir só de
   * `cobranca.valor_total`, que ignoraria recibos já emitidos.
   */
  saldoPagar: number;
  onAbrir: (alvo: ParcelamentoFaturaAlvo) => void;
}) {
  const { data: acordoAtivo } = useAcordoAtivoPorCobranca(cobranca.id);
  const navigate = useNavigate();
  if (invoice.tipo !== 'FT') return null;

  // Já parcelada: em vez de desaparecer sem mais nada (como fazia antes — o
  // utilizador não tinha como voltar à central das parcelas a partir daqui),
  // mostra um ícone que navega para o acordo já existente.
  if (acordoAtivo) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        title={`Ver acordo de pagamento (ACD-${acordoAtivo.codigo})`}
        onClick={() => navigate(`/acordos/${acordoAtivo.id}`)}
      >
        <HandCoins className="h-3.5 w-3.5" />
      </Button>
    );
  }

  if (saldoPagar <= 0.005) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      title="Parcelar fatura"
      onClick={() =>
        onAbrir({
          cobrancaId: cobranca.id,
          contratoId,
          numeroDocumento: cobranca.documento_externo_ref || invoice.numero || '',
          dataDocumento: invoice.data_emissao || '',
          valorTotal: cobranca.valor_total ?? 0,
          saldoPagar,
          titularId: cobranca.destinatario_id,
          titularNome: cobranca.destinatario_nome,
          titularNif: invoice.cliente_nif,
        })
      }
    >
      <CalendarClock className="h-3.5 w-3.5" />
    </Button>
  );
}
