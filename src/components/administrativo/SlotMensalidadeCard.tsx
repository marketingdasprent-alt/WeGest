/**
 * Card "Mensalidade Slot" do Resumo (Administração). Mostra as cobranças mensais
 * de slot do motorista e permite emitir a fatura fiscal (reusa a máquina de
 * faturação) e marcar como paga.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Send, CheckCircle2, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useSlotCobrancasMensais, type SlotCobranca } from '@/hooks/useSlotCobrancasMensais';
import { useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { clienteRowToFatura, baixarDocumentoPdf } from '@/lib/faturacao';
import type { ItemFatura } from '@/types/faturacao';

const ESTADO_CLASS: Record<string, string> = {
  pendente: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  emitida: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  paga: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  anulada: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

export function SlotMensalidadeCard({ motoristaId }: { motoristaId?: string }) {
  const qc = useQueryClient();
  const { data: cobrancas = [], isLoading } = useSlotCobrancasMensais(motoristaId);
  const emitirMut = useEmitirEEscreverFatura();
  const [busyId, setBusyId] = useState<string | null>(null);

  const visiveis = cobrancas.filter((c) => c.estado !== 'anulada');

  const [sortField, setSortField] = useState<string>('periodo_de');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const sortedVisiveis = useMemo(() => {
    const list = [...visiveis];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'periodo_de') {
        va = a.periodo_de || '';
        vb = b.periodo_de || '';
      } else if (sortField === 'valor_total') {
        va = a.valor_total ?? 0;
        vb = b.valor_total ?? 0;
      } else if (sortField === 'estado') {
        va = a.estado || '';
        vb = b.estado || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [visiveis, sortField, sortDir]);

  if (!motoristaId || (!isLoading && visiveis.length === 0)) return null;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['slot-cobrancas-mensais', motoristaId] });
  }

  async function emitirFatura(c: SlotCobranca) {
    setBusyId(c.id);
    try {
      const { data: cli } = await supabase
        .from('clientes')
        .select('nome, nif, email, morada, codigo_postal, localidade')
        .eq('id', c.destinatario_id)
        .single();
      const itens: ItemFatura[] = [
        {
          descricao: c.descricao ?? 'Mensalidade de slot',
          quantidade: 1,
          preco_unitario: c.valor_sem_iva ?? 0,
          taxa_iva: c.taxa_iva ?? 23,
        },
      ];
      const res = await emitirMut.mutateAsync({
        payload: {
          tipo: 'FR',
          cliente: clienteRowToFatura(cli, c.destinatario_nome),
          itens,
          cobranca_id: c.id,
          referencia_externa: c.descricao ?? 'Slot mensal',
        },
        cobrancaId: c.id,
        contratoId: c.reserva_id ?? c.id,
      });
      if (res.invoice) {
        try {
          await baixarDocumentoPdf(res.invoice);
        } catch {
          /* best-effort */
        }
      }
      toast.success(`Fatura emitida${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`);
      if (res.warning) toast.warning(res.warning);
      invalidate();
    } catch (e: any) {
      toast.error(`Falha a emitir fatura: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function marcarPaga(c: SlotCobranca) {
    setBusyId(c.id);
    try {
      const { error } = await supabase
        .from('contrato_cobrancas')
        .update({ estado: 'paga', pago_em: new Date().toISOString() })
        .eq('id', c.id);
      if (error) throw error;
      toast.success('Mensalidade marcada como paga.');
      invalidate();
    } catch (e: any) {
      toast.error(`Falha a marcar paga: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg overflow-hidden border border-amber-200 print:hidden">
      <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: '#f59e0b' }}>
        <Receipt className="h-4 w-4" style={{ color: '#fff' }} />
        <h2 className="font-semibold text-sm" style={{ color: '#fff' }}>
          MENSALIDADE SLOT
        </h2>
      </div>
      <div className="bg-amber-50 dark:bg-amber-950/20 p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                field="periodo_de"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Período
              </SortableTableHead>
              <SortableTableHead
                field="valor_total"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              >
                Valor
              </SortableTableHead>
              <SortableTableHead
                field="estado"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Estado
              </SortableTableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedVisiveis.map((c) => {
              const porEmitir =
                !c.documento_externo_ref && c.emite_fatura_fiscal && c.estado === 'pendente';
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">
                    {formatDate(c.periodo_de)} – {formatDate(c.periodo_ate)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(c.valor_total)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('capitalize border', ESTADO_CLASS[c.estado] ?? '')}
                    >
                      {c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {porEmitir && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() => emitirFatura(c)}
                          disabled={busyId === c.id}
                        >
                          {busyId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Emitir
                        </Button>
                      )}
                      {c.estado !== 'paga' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-emerald-700"
                          onClick={() => marcarPaga(c)}
                          disabled={busyId === c.id}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Paga
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
