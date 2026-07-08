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
            {legenda && (
              <p className={cn('text-[11px] mt-0.5 truncate', valorClass)}>{legenda}</p>
            )}
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

export function ClienteContaCorrenteTab({ clienteId }: ClienteContaCorrenteTabProps) {
  const navigate = useNavigate();
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const { data, isLoading, isError } = useContaCorrenteCliente(clienteId);

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
  const linhas = data?.linhas ?? [];

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

      {/* Tabela de documentos / movimentos — desktop */}
      <div className="hidden sm:block rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-xs">Data</TableHead>
              <TableHead className="h-9 text-xs">Nº / Ref.</TableHead>
              <TableHead className="h-9 text-xs">Tipo</TableHead>
              <TableHead className="h-9 text-xs">Descrição</TableHead>
              <TableHead className="h-9 text-xs">Contrato</TableHead>
              <TableHead className="h-9 text-xs text-right">Débito</TableHead>
              <TableHead className="h-9 text-xs text-right">Crédito</TableHead>
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
                      <Badge
                        variant="outline"
                        className={cn('border-0', DOC_TIPO_CLASS[row.docTipo])}
                      >
                        {DOC_TIPO_LABEL[row.docTipo]}
                      </Badge>
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
                  <Badge variant="outline" className={cn('border-0', DOC_TIPO_CLASS[row.docTipo])}>
                    {DOC_TIPO_LABEL[row.docTipo]}
                  </Badge>
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
