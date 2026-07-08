import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  FileDown,
  ArrowDownAZ,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface ResumoBase {
  motorista_id?: string;
  driver_name: string;
  liquido: number;
  aluguer: number;
  combustivel: number;
  portagens: number;
  reparacoes: number;
}

interface RelatorioPagamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumos: ResumoBase[];
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
}

interface LinhaRelatorio {
  motorista_id: string;
  nome: string;
  iban: string;
  liquido: number;
  viatura: number;
  combustivel: number;
  portagens: number;
  rnvat: number;
  seguros: number;
  acordos: number;
  danos: number;
  caucao: number;
  negativoAnterior: number;
  devCaucao: number;
  bonificacao: number;
  ajudaCusto: number;
  outrasDevolucoes: number;
}

type ColunaFinanceira =
  | 'rnvat'
  | 'seguros'
  | 'acordos'
  | 'caucao'
  | 'negativoAnterior'
  | 'devCaucao'
  | 'bonificacao'
  | 'ajudaCusto'
  | 'outrasDevolucoes';

// Categorias de motorista_financeiro que alimentam colunas deste relatório
// (somadas por valor absoluto, independentemente de crédito/débito).
const CAT_MAP: Record<string, ColunaFinanceira> = {
  rnvat: 'rnvat',
  seguros: 'seguros',
  acordo: 'acordos',
  caucao: 'caucao',
  negativo_anterior: 'negativoAnterior',
  dev_caucao: 'devCaucao',
  bonus: 'bonificacao',
  ajuda_custo: 'ajudaCusto',
  outras_devolucoes: 'outrasDevolucoes',
};

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

// Colunas ordenáveis: clicar no cabeçalho ordena por esta chave (asc/desc).
type SortKey =
  | 'nome'
  | 'liquido'
  | 'viatura'
  | 'combustivel'
  | 'portagens'
  | 'rnvat'
  | 'seguros'
  | 'acordos'
  | 'danos'
  | 'caucao'
  | 'negativoAnterior'
  | 'devCaucao'
  | 'bonificacao'
  | 'ajudaCusto'
  | 'outrasDevolucoes';

export function RelatorioPagamentoDialog({
  open,
  onOpenChange,
  resumos,
  weekStart,
  weekEnd,
  weekLabel,
}: RelatorioPagamentoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [ibanMap, setIbanMap] = useState<Record<string, string>>({});
  const [financeiroMap, setFinanceiroMap] = useState<
    Record<string, Partial<Record<ColunaFinanceira, number>>>
  >({});
  // Motoristas marcados como "já pago" (só visual, ajuda a acompanhar os
  // pagamentos durante a sessão — risca a linha; não persiste).
  const [pagos, setPagos] = useState<Set<string>>(new Set());
  // Ordem manual (array de motorista_id). Vazio = ordem alfabética.
  // Arrastar uma linha preenche esta ordem e passa a sobrepor a alfabética.
  const [ordemManual, setOrdemManual] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  // Ordenação por coluna (clicar no cabeçalho). Sobrepõe-se à alfabética e à
  // ordem manual; arrastar uma linha limpa a ordenação (ver handleDrop).
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Reset da ordenação ao fechar (os "pagos" são recarregados da BD ao abrir).
  useEffect(() => {
    if (!open) {
      setPagos(new Set());
      setOrdemManual([]);
      setDragId(null);
      setSortCol(null);
      setSortDir('asc');
    }
  }, [open]);

  // Carrega os motoristas já marcados como "pago" desta semana. Fica guardado
  // na BD (partilhado por toda a equipa), por isso corre ao abrir e sempre que
  // a semana muda.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const semana = format(weekStart, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('relatorio_pagamento_pagos')
        .select('motorista_id')
        .eq('semana_inicio', semana);
      if (cancelled) return;
      if (error) {
        console.error('Erro a carregar pagamentos marcados:', error);
        return;
      }
      setPagos(new Set((data || []).map((r) => r.motorista_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, weekStart]);

  // Marca/desmarca um motorista como pago e persiste na BD. Atualização
  // otimista (UI mexe já); se a BD falhar, reverte e avisa.
  const togglePago = async (id: string) => {
    const semana = format(weekStart, 'yyyy-MM-dd');
    const estavaPago = pagos.has(id);

    setPagos((prev) => {
      const next = new Set(prev);
      if (estavaPago) next.delete(id);
      else next.add(id);
      return next;
    });

    const { error } = estavaPago
      ? await supabase
          .from('relatorio_pagamento_pagos')
          .delete()
          .eq('motorista_id', id)
          .eq('semana_inicio', semana)
      : await supabase.from('relatorio_pagamento_pagos').upsert(
          { motorista_id: id, semana_inicio: semana },
          { onConflict: 'org_id,motorista_id,semana_inicio', ignoreDuplicates: true }
        );

    if (error) {
      setPagos((prev) => {
        const next = new Set(prev);
        if (estavaPago) next.add(id);
        else next.delete(id);
        return next;
      });
      toast.error('Não foi possível guardar o estado de pagamento. Tenta de novo.');
    }
  };

  // Clicar num cabeçalho: 1.º clique ordena, clique seguinte inverte asc/desc.
  const toggleSort = (col: SortKey) => {
    setOrdemManual([]); // ordenar por coluna limpa a ordem manual (arrastada)
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      // Números: maior→menor por defeito (mais útil); nome: A→Z.
      setSortDir(col === 'nome' ? 'asc' : 'desc');
    }
  };

  const comMotoristaId = useMemo(
    () => resumos.filter((r): r is ResumoBase & { motorista_id: string } => !!r.motorista_id),
    [resumos]
  );

  useEffect(() => {
    if (!open || comMotoristaId.length === 0) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const ids = comMotoristaId.map((r) => r.motorista_id);
        const weekStartStr = format(weekStart, 'yyyy-MM-dd');
        const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

        const [ibanResult, financeiroResult] = await Promise.all([
          supabase.from('motoristas_ativos').select('id, iban').in('id', ids),
          supabase
            .from('motorista_financeiro')
            .select('motorista_id, valor, categoria')
            .gte('data_movimento', weekStartStr)
            .lte('data_movimento', weekEndStr)
            .eq('status', 'pendente')
            .in('motorista_id', ids),
        ]);

        if (cancelled) return;

        const ibans: Record<string, string> = {};
        (ibanResult.data || []).forEach((m: any) => {
          if (m.iban) ibans[m.id] = m.iban;
        });
        setIbanMap(ibans);

        const fin: Record<string, Partial<Record<ColunaFinanceira, number>>> = {};
        (financeiroResult.data || []).forEach((m: any) => {
          const col = m.categoria ? CAT_MAP[m.categoria] : undefined;
          if (!col || !m.motorista_id) return;
          const val = Math.abs(Number(m.valor) || 0);
          if (!fin[m.motorista_id]) fin[m.motorista_id] = {};
          fin[m.motorista_id][col] = (fin[m.motorista_id][col] || 0) + val;
        });
        setFinanceiroMap(fin);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, comMotoristaId, weekStart, weekEnd]);

  const linhas: LinhaRelatorio[] = useMemo(
    () =>
      comMotoristaId.map((r) => {
        const fin = financeiroMap[r.motorista_id] || {};
        return {
          motorista_id: r.motorista_id,
          nome: r.driver_name,
          iban: ibanMap[r.motorista_id] || '',
          liquido: r.liquido,
          viatura: r.aluguer,
          combustivel: r.combustivel,
          portagens: r.portagens,
          rnvat: fin.rnvat || 0,
          seguros: fin.seguros || 0,
          acordos: fin.acordos || 0,
          danos: r.reparacoes,
          caucao: fin.caucao || 0,
          negativoAnterior: fin.negativoAnterior || 0,
          devCaucao: fin.devCaucao || 0,
          bonificacao: fin.bonificacao || 0,
          ajudaCusto: fin.ajudaCusto || 0,
          outrasDevolucoes: fin.outrasDevolucoes || 0,
        };
      }),
    [comMotoristaId, financeiroMap, ibanMap]
  );

  // Ordenação, por prioridade:
  //  1) por coluna, se o utilizador clicou num cabeçalho (sortCol);
  //  2) senão, alfabética por nome, com a ordem manual (arrastada) a sobrepor-se.
  // Motoristas fora da ordem manual (ex.: dados que carregaram depois) vão para
  // o fim, alfabéticos.
  const linhasOrdenadas = useMemo(() => {
    const arr = [...linhas];

    if (sortCol) {
      arr.sort((a, b) => {
        const cmp =
          sortCol === 'nome'
            ? a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' })
            : (a[sortCol] as number) - (b[sortCol] as number);
        return sortDir === 'asc' ? cmp : -cmp;
      });
      return arr;
    }

    const alfabetica = arr.sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' })
    );
    if (ordemManual.length === 0) return alfabetica;
    const pos = new Map(ordemManual.map((id, i) => [id, i]));
    return alfabetica.sort((a, b) => {
      const pa = pos.has(a.motorista_id) ? pos.get(a.motorista_id)! : Number.MAX_SAFE_INTEGER;
      const pb = pos.has(b.motorista_id) ? pos.get(b.motorista_id)! : Number.MAX_SAFE_INTEGER;
      return pa - pb;
    });
  }, [linhas, ordemManual, sortCol, sortDir]);

  // Drag-n-drop (HTML5 nativo — mesmo padrão do kanban-board do projeto).
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const base = linhasOrdenadas.map((l) => l.motorista_id);
    const from = base.indexOf(dragId);
    const to = base.indexOf(targetId);
    if (from === -1 || to === -1) return;
    base.splice(to, 0, base.splice(from, 1)[0]);
    setSortCol(null); // arrastar assume o controlo: passa a mandar a ordem manual
    setOrdemManual(base);
    setDragId(null);
  };

  const totais = useMemo(() => {
    const t = {
      liquido: 0,
      viatura: 0,
      combustivel: 0,
      portagens: 0,
      rnvat: 0,
      seguros: 0,
      acordos: 0,
      danos: 0,
      caucao: 0,
      negativoAnterior: 0,
      devCaucao: 0,
      bonificacao: 0,
      ajudaCusto: 0,
      outrasDevolucoes: 0,
    };
    linhasOrdenadas.forEach((l) => {
      t.liquido += l.liquido;
      t.viatura += l.viatura;
      t.combustivel += l.combustivel;
      t.portagens += l.portagens;
      t.rnvat += l.rnvat;
      t.seguros += l.seguros;
      t.acordos += l.acordos;
      t.danos += l.danos;
      t.caucao += l.caucao;
      t.negativoAnterior += l.negativoAnterior;
      t.devCaucao += l.devCaucao;
      t.bonificacao += l.bonificacao;
      t.ajudaCusto += l.ajudaCusto;
      t.outrasDevolucoes += l.outrasDevolucoes;
    });
    return t;
  }, [linhasOrdenadas]);

  const handleExport = () => {
    const rows = linhasOrdenadas.map((l) => ({
      Nome: l.nome,
      IBAN: l.iban,
      Semana: weekLabel,
      Pago: pagos.has(l.motorista_id) ? 'Sim' : '',
      'Valor a Pagar (€)': l.liquido,
      Negativos: l.liquido < 0 ? l.liquido : '',
      'Viatura (€)': l.viatura,
      'Combustível (€)': l.combustivel,
      'Portagens (€)': l.portagens,
      'RNVAT (€)': l.rnvat,
      'Seguros (€)': l.seguros,
      'Acordos (€)': l.acordos,
      'Danos (€)': l.danos,
      'Caução (€)': l.caucao,
      'Negativo Anterior (€)': l.negativoAnterior,
      'Dev. Caução (€)': l.devCaucao,
      'Bonificação Motorista (€)': l.bonificacao,
      'Ajuda Custo (€)': l.ajudaCusto,
      'Outras Devoluções (€)': l.outrasDevolucoes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Pagamento');
    XLSX.writeFile(wb, `relatorio_pagamento_${format(weekStart, 'yyyyMMdd')}.xlsx`);
  };

  // Colunas custo (tons vermelhos) vs colunas crédito/devolução (tons verdes)
  const custoCls = 'bg-red-50/60 dark:bg-red-950/20 text-red-700 dark:text-red-400';
  const creditoCls =
    'bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400';

  // Quando a linha está paga (verde), suprime-se o tom vermelho/verde da célula
  // para o verde da linha aparecer por baixo.
  const Cell = ({ value, cls, pago }: { value: number; cls?: string; pago?: boolean }) => (
    <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${pago ? '' : cls || ''}`}>
      {value ? fmtEur(value) : <span className="text-muted-foreground/50">—</span>}
    </td>
  );

  // Indicador de ordenação no cabeçalho. Coluna ativa: seta maior, traço grosso
  // e fundo em pílula para saltar à vista. Inativa: seta dupla bem legível.
  const sortIcon = (col: SortKey) =>
    sortCol === col ? (
      <span className="inline-flex items-center justify-center rounded bg-primary-foreground/25 p-0.5">
        {sortDir === 'asc' ? (
          <ChevronUp className="h-4 w-4" strokeWidth={3} />
        ) : (
          <ChevronDown className="h-4 w-4" strokeWidth={3} />
        )}
      </span>
    ) : (
      <ChevronsUpDown className="h-4 w-4 opacity-70" strokeWidth={2.5} />
    );

  // Cabeçalho de coluna numérica, clicável para ordenar.
  const Th = ({ col, label }: { col: SortKey; label: string }) => (
    <th className="px-3 py-2 text-right text-xs font-semibold whitespace-nowrap">
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex flex-row-reverse items-center gap-1 hover:opacity-80"
        title={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        {sortIcon(col)}
      </button>
    </th>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-full h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 pr-14 border-b bg-muted/30 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>Relatório de Pagamento — {weekLabel}</DialogTitle>
            <div className="flex items-center gap-2 mr-2">
              {(ordemManual.length > 0 || sortCol) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOrdemManual([]);
                    setSortCol(null);
                  }}
                >
                  <ArrowDownAZ className="h-4 w-4 mr-2" />
                  Ordem alfabética
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : linhas.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Sem motoristas com resumo nesta semana.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap sticky left-0 bg-primary z-20">
                    <span className="inline-flex items-center gap-1.5">
                      <span title="Marcar como pago">Pago</span>
                      <span className="opacity-60">·</span>
                      <button
                        type="button"
                        onClick={() => toggleSort('nome')}
                        className="inline-flex items-center gap-1 hover:opacity-80"
                        title="Ordenar por nome"
                      >
                        Nome
                        {sortIcon('nome')}
                      </button>
                    </span>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">
                    IBAN
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold whitespace-nowrap">
                    Semana
                  </th>
                  <Th col="liquido" label="Valor a Pagar" />
                  <th className="px-3 py-2 text-right text-xs font-semibold whitespace-nowrap">
                    Negativos
                  </th>
                  <Th col="viatura" label="Viatura" />
                  <Th col="combustivel" label="Combustível" />
                  <Th col="portagens" label="Portagens" />
                  <Th col="rnvat" label="RNVAT" />
                  <Th col="seguros" label="Seguros" />
                  <Th col="acordos" label="Acordos" />
                  <Th col="danos" label="Danos" />
                  <Th col="caucao" label="Caução" />
                  <Th col="negativoAnterior" label="Neg. Anterior" />
                  <Th col="devCaucao" label="Dev. Caução" />
                  <Th col="bonificacao" label="Bonificação" />
                  <Th col="ajudaCusto" label="Ajuda Custo" />
                  <Th col="outrasDevolucoes" label="Outras Devol." />
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.map((l, idx) => {
                  const negativo = l.liquido < 0;
                  const pago = pagos.has(l.motorista_id);
                  const rowBg = pago
                    ? 'bg-emerald-100 dark:bg-emerald-950/50'
                    : idx % 2 === 0
                    ? 'bg-background'
                    : 'bg-muted/20';
                  return (
                    <tr
                      key={l.motorista_id}
                      onDragOver={(e) => dragId && e.preventDefault()}
                      onDrop={() => handleDrop(l.motorista_id)}
                      className={`border-b transition-colors ${rowBg} ${
                        negativo && !pago ? 'ring-1 ring-inset ring-red-300 dark:ring-red-900' : ''
                      } ${dragId === l.motorista_id ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-2 text-xs font-medium whitespace-nowrap sticky left-0 bg-inherit">
                        <div className="flex items-center gap-2">
                          {/* Só o grip inicia o arrasto — não interfere com o clique
                              na checkbox nem na seleção do nome. */}
                          <span
                            draggable
                            onDragStart={() => setDragId(l.motorista_id)}
                            onDragEnd={() => setDragId(null)}
                            className="cursor-grab shrink-0 text-muted-foreground/40"
                            aria-label={`Arrastar ${l.nome} para reordenar`}
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <Checkbox
                            checked={pago}
                            onCheckedChange={() => togglePago(l.motorista_id)}
                            aria-label={`Marcar ${l.nome} como pago`}
                          />
                          <span
                            className={
                              pago ? 'font-semibold text-emerald-800 dark:text-emerald-200' : ''
                            }
                          >
                            {l.nome}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {l.iban || (
                          <span className="italic text-muted-foreground/50">sem IBAN</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-center text-muted-foreground whitespace-nowrap">
                        {weekLabel}
                      </td>
                      <td
                        className={`px-3 py-2 text-right text-xs font-bold whitespace-nowrap ${
                          pago
                            ? 'text-emerald-800 dark:text-emerald-200'
                            : negativo
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {fmtEur(l.liquido)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-bold whitespace-nowrap">
                        {negativo ? (
                          <span className="text-red-600 dark:text-red-400">
                            {fmtEur(l.liquido)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <Cell value={l.viatura} cls={custoCls} pago={pago} />
                      <Cell value={l.combustivel} cls={custoCls} pago={pago} />
                      <Cell value={l.portagens} cls={custoCls} pago={pago} />
                      <Cell value={l.rnvat} cls={custoCls} pago={pago} />
                      <Cell value={l.seguros} cls={custoCls} pago={pago} />
                      <Cell value={l.acordos} cls={custoCls} pago={pago} />
                      <Cell value={l.danos} cls={custoCls} pago={pago} />
                      <Cell value={l.caucao} cls={custoCls} pago={pago} />
                      <Cell value={l.negativoAnterior} cls={custoCls} pago={pago} />
                      <Cell value={l.devCaucao} cls={creditoCls} pago={pago} />
                      <Cell value={l.bonificacao} cls={creditoCls} pago={pago} />
                      <Cell value={l.ajudaCusto} cls={creditoCls} pago={pago} />
                      <Cell value={l.outrasDevolucoes} cls={creditoCls} pago={pago} />
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary/40 bg-muted/40 font-semibold">
                  <td className="px-3 py-2 text-xs bg-muted/40">Total</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td
                    className={`px-3 py-2 text-right text-xs ${
                      totais.liquido < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {fmtEur(totais.liquido)}
                  </td>
                  <td className="px-3 py-2" />
                  <Cell value={totais.viatura} />
                  <Cell value={totais.combustivel} />
                  <Cell value={totais.portagens} />
                  <Cell value={totais.rnvat} />
                  <Cell value={totais.seguros} />
                  <Cell value={totais.acordos} />
                  <Cell value={totais.danos} />
                  <Cell value={totais.caucao} />
                  <Cell value={totais.negativoAnterior} />
                  <Cell value={totais.devCaucao} />
                  <Cell value={totais.bonificacao} />
                  <Cell value={totais.ajudaCusto} />
                  <Cell value={totais.outrasDevolucoes} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
