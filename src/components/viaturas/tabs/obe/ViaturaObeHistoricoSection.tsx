import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Loader2, Search, History as HistoryIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface HistoricoItem {
  transaction_id: string;
  transaction_date: string;
  amount: number;
  barreira_entrada: string | null;
  barreira_saida: string | null;
  operador: string | null;
  tipo_evento: string | null;
  motorista_id: string | null;
  motorista_nome: string | null;
  contrato_id: string | null;
  contrato_codigo: number | null;
}

const fmtEur = (v: number | null) =>
  v == null
    ? '-'
    : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const fmtDT = (s: string) => {
  try {
    return format(new Date(s), 'dd/MM/yyyy HH:mm', { locale: pt });
  } catch {
    return s.slice(0, 16);
  }
};

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

interface ViaturaObeHistoricoSectionProps {
  viaturaId: string;
}

export function ViaturaObeHistoricoSection({ viaturaId }: ViaturaObeHistoricoSectionProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoricoItem[]>([]);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('transaction_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const carregar = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_viatura_historico_portagens', {
        p_viatura_id: viaturaId,
        p_data_inicio: dataInicio || null,
        p_data_fim: dataFim || null,
      });
      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar histórico de portagens');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    carregar();
  }, [viaturaId, dataInicio, dataFim]);

  const filtered = useMemo(() => {
    const list = !search
      ? [...items]
      : items.filter((h) => {
          const t = norm(search);
          return (
            norm(h.barreira_entrada || '').includes(t) ||
            norm(h.barreira_saida || '').includes(t) ||
            norm(h.operador || '').includes(t) ||
            norm(h.motorista_nome || '').includes(t) ||
            norm(h.contrato_codigo ? String(h.contrato_codigo) : '').includes(t)
          );
        });
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'transaction_date') {
        va = a.transaction_date;
        vb = b.transaction_date;
      } else if (sortField === 'barreira_entrada') {
        va = a.barreira_entrada || '';
        vb = b.barreira_entrada || '';
      } else if (sortField === 'barreira_saida') {
        va = a.barreira_saida || '';
        vb = b.barreira_saida || '';
      } else if (sortField === 'operador') {
        va = a.operador || '';
        vb = b.operador || '';
      } else if (sortField === 'motorista_nome') {
        va = a.motorista_nome || '';
        vb = b.motorista_nome || '';
      } else if (sortField === 'contrato_codigo') {
        va = a.contrato_codigo || 0;
        vb = b.contrato_codigo || 0;
      } else if (sortField === 'amount') {
        va = a.amount || 0;
        vb = b.amount || 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, search, sortField, sortDir]);

  const total = useMemo(
    () => filtered.reduce((a, h) => a + (Number(h.amount) || 0), 0),
    [filtered]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Até</Label>
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5 flex-1 min-w-[220px]">
          <Label className="text-xs">Pesquisar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Barreira, operador, motorista, contrato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
            <HistoryIcon className="h-8 w-8" />
            <p>Sem portagens registadas para esta viatura no período selecionado.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-between items-center text-sm px-1">
            <span className="text-muted-foreground">{filtered.length} portagem(ns)</span>
            <span className="font-semibold">{fmtEur(total)}</span>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="transaction_date"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Data
                  </SortableTableHead>
                  <SortableTableHead
                    field="barreira_entrada"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Entrada
                  </SortableTableHead>
                  <SortableTableHead
                    field="barreira_saida"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Saída
                  </SortableTableHead>
                  <SortableTableHead
                    field="operador"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Operador
                  </SortableTableHead>
                  <SortableTableHead
                    field="motorista_nome"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Motorista (à data)
                  </SortableTableHead>
                  <SortableTableHead
                    field="contrato_codigo"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Contrato (à data)
                  </SortableTableHead>
                  <SortableTableHead
                    field="amount"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  >
                    Valor
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((h) => (
                  <TableRow key={h.transaction_id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fmtDT(h.transaction_date)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">
                      {h.barreira_entrada || '-'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">
                      {h.barreira_saida || '-'}
                    </TableCell>
                    <TableCell className="text-xs">{h.operador || '-'}</TableCell>
                    <TableCell className="text-xs">{h.motorista_nome || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {h.contrato_codigo ? `#${h.contrato_codigo}` : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium whitespace-nowrap">
                      {fmtEur(h.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
