import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Banknote,
  Receipt,
  Scale,
  Download,
  Loader2,
  FileText,
  ChevronRight,
  AlertCircle,
  HandCoins,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  DOC_TIPO_LABEL,
  DOC_TIPO_CLASS,
  type FaturacaoRow,
} from '@/components/administrativo/faturacao';
import { baixarDocumentoPdf } from '@/lib/faturacao';
import type { InvoiceMetadata } from '@/types/faturacao';
import { useContaCorrenteCliente } from '@/hooks/useContaCorrenteCliente';
import { useAcordoAtivoResumoPorEntidade } from '@/hooks/useAcordosPagamento';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface ClienteContaCorrenteTabProps {
  clienteId: string | null;
}

/** Cartão de resumo no topo (label + valor grande + ícone em pill + legenda). */
function ResumoCard({
  label,
  valor,
  icon,
  tone,
  legenda,
}: {
  label: string;
  valor: number;
  icon: React.ReactNode;
  tone: 'neutral' | 'credit' | 'saldo';
  /** Frase por baixo do valor — não deixa o significado depender só da cor. */
  legenda?: string;
}) {
  // O saldo pinta-se pelo sinal: dívida (>0) a vermelho, saldado/crédito a verde.
  const positivo = valor > 0.005;
  const valorClass =
    tone === 'credit'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'saldo'
        ? positivo
          ? 'text-red-600 dark:text-red-400'
          : 'text-emerald-600 dark:text-emerald-400'
        : 'text-foreground';
  const iconWrap =
    tone === 'credit'
      ? 'bg-emerald-500/10 text-emerald-500'
      : tone === 'saldo'
        ? positivo
          ? 'bg-red-500/10 text-red-500'
          : 'bg-emerald-500/10 text-emerald-500'
        : 'bg-primary/10 text-primary';

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className={cn('text-2xl font-bold truncate mt-0.5', valorClass)}>
              {formatCurrency(valor)}
            </p>
            {legenda && <p className={cn('text-[11px] mt-0.5 truncate', valorClass)}>{legenda}</p>}
          </div>
          <div className={cn('p-2 rounded-lg shrink-0', iconWrap)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Legenda do saldo — o significado não pode depender só da cor. */
function legendaSaldo(saldo: number): string {
  if (saldo > 0.005) return `${formatCurrency(saldo)} por liquidar`;
  if (saldo < -0.005) return `${formatCurrency(Math.abs(saldo))} a favor do cliente`;
  return 'Tudo liquidado';
}

/**
 * Cartão de acordo de pagamento ativo — só aparece quando o cliente (titular
 * ou responsável) tem um acordo em curso. Ver §7.5 da spec: "a conta-corrente
 * ganha um cartão de acordo no topo (valor por pagar, próxima data, progresso
 * N/M)". Cartão distinto (não uma 4ª tile na grelha Faturado/Recebido/Saldo)
 * porque tem mais informação (estado, nº de parcelas, CTA) do que as tiles
 * simples cabem.
 */
function AcordoResumoCard({
  acordo,
  onVerAcordo,
}: {
  acordo: NonNullable<ReturnType<typeof useAcordoAtivoResumoPorEntidade>['data']>;
  onVerAcordo: () => void;
}) {
  const emIncumprimento = acordo.estado === 'incumprimento';
  return (
    <Card
      className={cn(
        'overflow-hidden border-l-4',
        emIncumprimento ? 'border-l-red-500' : 'border-l-amber-500'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'p-2 rounded-lg shrink-0',
                emIncumprimento ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600'
              )}
            >
              <HandCoins className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Acordo de pagamento{emIncumprimento ? ' — em incumprimento' : ''}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                Acordo #{acordo.codigo} · {acordo.parcelasPagas}/{acordo.parcelasTotal} parcelas
                {acordo.proximaData ? ` · próxima em ${formatDate(acordo.proximaData)}` : ''}
                {acordo.outrosAtivos > 0 ? ` · +${acordo.outrosAtivos} outro(s) acordo(s)` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Por pagar
              </p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatCurrency(acordo.faltaPagar)}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onVerAcordo}>
              Ver acordo
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Um movimento de cessão de dívida (`acordo_criar`/`acordo_cancelar`, migração
 * 20260724100001). `row.descritivo` já vem com a redação exacta aprovada em
 * §7.5 da spec ("Dívida cedida a X" no crédito do titular, "Dívida assumida
 * (cedida por X)" no débito do responsável) — gravada assim na própria coluna
 * `descricao` pelo backend, não reconstruída aqui. O que falta identificar
 * visualmente é o TIPO do movimento: sem isto, `singleDocTipo` (faturacao.ts)
 * cai no fallback 'ajuste' e a badge mostra "Ajuste", indistinguível de um
 * ajuste manual qualquer.
 */
function isCessao(origem: string): boolean {
  return origem === 'cessao';
}

export function ClienteContaCorrenteTab({ clienteId }: ClienteContaCorrenteTabProps) {
  const navigate = useNavigate();
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('dataMovimento');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);
  const { data, isLoading, isError } = useContaCorrenteCliente(clienteId);
  const { data: acordoAtivo } = useAcordoAtivoResumoPorEntidade(clienteId);

  if (!clienteId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Banknote className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-sm">
          Guarde o cliente primeiro para consultar a conta corrente.
        </p>
      </div>
    );
  }

  async function baixarPdf(e: React.MouseEvent, inv: InvoiceMetadata) {
    e.stopPropagation(); // não navegar para o contrato ao clicar no botão de PDF
    setBaixandoId(inv.cobranca_id ?? inv.id);
    try {
      await baixarDocumentoPdf(inv);
    } catch (err: any) {
      toast.error(
        `Não foi possível descarregar o PDF${err?.message ? `: ${err.message}` : '. Tenta novamente.'}`
      );
    } finally {
      setBaixandoId(null);
    }
  }

  /** Ao clicar na linha, abre o contrato (ou reserva) a que o movimento pertence. */
  function abrirOrigem(row: FaturacaoRow) {
    if (row.contratoId) navigate(`/renting/contratos/${row.contratoId}`);
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground max-w-sm">
          Não foi possível carregar a conta corrente. Atualiza a página e tenta novamente.
        </p>
      </div>
    );
  }

  const faturado = data?.faturado ?? 0;
  const recebido = data?.recebido ?? 0;
  const saldo = data?.saldo ?? 0;
  const linhas = [...(data?.linhas ?? [])].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    if (sortField === 'dataMovimento') {
      va = a.dataMovimento || '';
      vb = b.dataMovimento || '';
    } else if (sortField === 'numeroDoc') {
      va = a.numeroDoc || '';
      vb = b.numeroDoc || '';
    } else if (sortField === 'docTipo') {
      va = a.docTipo || '';
      vb = b.docTipo || '';
    } else if (sortField === 'descritivo') {
      va = a.descritivo || '';
      vb = b.descritivo || '';
    } else if (sortField === 'contratoLabel') {
      va = a.contratoLabel || '';
      vb = b.contratoLabel || '';
    } else if (sortField === 'debito') {
      va = a.debito || 0;
      vb = b.debito || 0;
    } else if (sortField === 'credito') {
      va = a.credito || 0;
      vb = b.credito || 0;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  /** Célula de valor (débito/crédito): mostra "—" quando não se aplica. */
  const valorCell = (valor: number | null, corClass: string) =>
    valor != null ? (
      <span className={cn('font-medium', corClass)}>{formatCurrency(valor)}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  return (
    <div className="space-y-4">
      {/* Cartões de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-[104px] w-full" />)
        ) : (
          <>
            <ResumoCard
              label="Faturado"
              valor={faturado}
              tone="neutral"
              icon={<Receipt className="h-5 w-5" />}
              legenda="Total das faturas emitidas"
            />
            <ResumoCard
              label="Recebido"
              valor={recebido}
              tone="credit"
              icon={<Banknote className="h-5 w-5" />}
              legenda="Pagamentos e notas de crédito"
            />
            <ResumoCard
              label="Saldo"
              valor={saldo}
              tone="saldo"
              icon={<Scale className="h-5 w-5" />}
              legenda={legendaSaldo(saldo)}
            />
          </>
        )}
      </div>

      {/* Cartão de acordo — só quando há um acordo ativo/em incumprimento deste cliente */}
      {acordoAtivo && (
        <AcordoResumoCard
          acordo={acordoAtivo}
          onVerAcordo={() => navigate(`/acordos/${acordoAtivo.id}`)}
        />
      )}

      {/* Tabela de documentos / movimentos — desktop */}
      <div className="hidden sm:block rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableTableHead
                field="dataMovimento"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9"
              >
                Data
              </SortableTableHead>
              <SortableTableHead
                field="numeroDoc"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9"
              >
                Nº / Ref.
              </SortableTableHead>
              <SortableTableHead
                field="docTipo"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9"
              >
                Tipo
              </SortableTableHead>
              <SortableTableHead
                field="descritivo"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9"
              >
                Descrição
              </SortableTableHead>
              <SortableTableHead
                field="contratoLabel"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9"
              >
                Contrato
              </SortableTableHead>
              <SortableTableHead
                field="debito"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
                className="h-9"
              >
                Débito
              </SortableTableHead>
              <SortableTableHead
                field="credito"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
                className="h-9"
              >
                Crédito
              </SortableTableHead>
              <TableHead className="h-9 text-xs text-center">PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  Ainda não há movimentos na conta corrente deste cliente.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((row) => {
                const inv = row.cobrancaId
                  ? data?.invoiceByCobranca.get(row.cobrancaId)
                  : undefined;
                const clicavel = !!row.contratoId;
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      clicavel && 'cursor-pointer hover:bg-muted/50'
                    )}
                    onClick={clicavel ? () => abrirOrigem(row) : undefined}
                    title={clicavel ? 'Abrir o contrato deste movimento' : undefined}
                  >
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(row.dataMovimento)}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.numeroDoc !== '—' ? row.numeroDoc : row.id.slice(0, 8).toUpperCase()}
                    </TableCell>
                    <TableCell>
                      {isCessao(row.origem) ? (
                        <Badge
                          variant="outline"
                          className="border-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                        >
                          Cessão
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn('border-0', DOC_TIPO_CLASS[row.docTipo])}
                        >
                          {DOC_TIPO_LABEL[row.docTipo]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm" title={row.descritivo}>
                      {row.descritivo}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {clicavel ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          {row.contratoLabel}
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{row.contratoLabel}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {valorCell(row.debito, 'text-red-600 dark:text-red-400')}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {valorCell(row.credito, 'text-emerald-600 dark:text-emerald-400')}
                    </TableCell>
                    <TableCell className="text-center">
                      {inv ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Descarregar PDF"
                          onClick={(e) => baixarPdf(e, inv)}
                          disabled={baixandoId === (inv.cobranca_id ?? inv.id)}
                        >
                          {baixandoId === (inv.cobranca_id ?? inv.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : (
                        <FileText
                          className="h-3.5 w-3.5 mx-auto text-muted-foreground/30"
                          aria-label="Sem documento disponível"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Cartões empilhados — telemóvel (a tabela de 8 colunas não cabe) */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : linhas.length === 0 ? (
          <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
            Ainda não há movimentos na conta corrente deste cliente.
          </div>
        ) : (
          linhas.map((row) => {
            const inv = row.cobrancaId ? data?.invoiceByCobranca.get(row.cobrancaId) : undefined;
            const clicavel = !!row.contratoId;
            return (
              <div
                key={row.id}
                className={cn(
                  'rounded-md border p-3 space-y-2 transition-colors',
                  clicavel && 'cursor-pointer hover:bg-muted/50 active:bg-muted'
                )}
                onClick={clicavel ? () => abrirOrigem(row) : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  {isCessao(row.origem) ? (
                    <Badge
                      variant="outline"
                      className="border-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    >
                      Cessão
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn('border-0', DOC_TIPO_CLASS[row.docTipo])}
                    >
                      {DOC_TIPO_LABEL[row.docTipo]}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(row.dataMovimento)}
                  </span>
                </div>
                <p className="text-sm truncate" title={row.descritivo}>
                  {row.descritivo}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-bold">
                    {row.debito != null ? (
                      <span className="text-red-600 dark:text-red-400">
                        − {formatCurrency(row.debito)}
                      </span>
                    ) : row.credito != null ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        + {formatCurrency(row.credito)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {inv && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={(e) => baixarPdf(e, inv)}
                        disabled={baixandoId === (inv.cobranca_id ?? inv.id)}
                      >
                        {baixandoId === (inv.cobranca_id ?? inv.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        PDF
                      </Button>
                    )}
                    {clicavel && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                        {row.contratoLabel}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
