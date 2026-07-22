import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';

import { useReservas } from '@/hooks/useReservas';
import { useContratosRenting } from '@/hooks/useContratosRenting';
import { formatDateTime, matchesCodigo, normalizeMatricula } from './contratosUtils';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface ContratoSelectorReservaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ESTADOS_ELEGIVEIS = ['confirmada', 'em_curso'] as const;

export const ContratoSelectorReserva: React.FC<ContratoSelectorReservaProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('codigo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const { data: reservas = [], isLoading: loadingReservas } = useReservas({
    limit: 500,
    enabled: open,
  });

  // Já temos os contratos carregados pela página de lista — reaproveita o cache
  const { data: contratos = [] } = useContratosRenting({ limit: 1000, enabled: open });

  const reservasIdsComContrato = useMemo(() => {
    const s = new Set<string>();
    contratos.forEach((c) => {
      if (c.reserva_id) s.add(c.reserva_id);
    });
    return s;
  }, [contratos]);

  const reservasElegiveis = useMemo(() => {
    const searchNorm = normalizeMatricula(search.trim());
    const list = reservas.filter((r) => {
      // Estado tem que ser confirmada ou em_curso
      if (!ESTADOS_ELEGIVEIS.includes(r.estado as (typeof ESTADOS_ELEGIVEIS)[number])) return false;
      // Tem que ter cliente E viatura (necessários para o contrato)
      if (!r.cliente_id || !r.viatura_id) return false;
      // Não pode ter contrato já criado (UNIQUE na BD)
      if (reservasIdsComContrato.has(r.id)) return false;
      // Search por matrícula ou código
      if (searchNorm) {
        const m = normalizeMatricula(r.matricula ?? '');
        const codigoMatch = matchesCodigo(r.codigo, search);
        if (!m.includes(searchNorm) && !codigoMatch) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'codigo') {
        va = a.codigo;
        vb = b.codigo;
      } else if (sortField === 'matricula') {
        va = a.matricula ?? '';
        vb = b.matricula ?? '';
      } else if (sortField === 'cliente_nome') {
        va = a.cliente_nome ?? '';
        vb = b.cliente_nome ?? '';
      } else if (sortField === 'data_inicio') {
        va = a.data_inicio ?? '';
        vb = b.data_inicio ?? '';
      } else if (sortField === 'estado') {
        va = a.estado ?? '';
        vb = b.estado ?? '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [reservas, reservasIdsComContrato, search, sortField, sortDir]);

  const handleSelect = (reservaId: string) => {
    onOpenChange(false);
    navigate(`/renting/contratos/novo?reserva_id=${reservaId}`);
  };

  const handleNovaReserva = () => {
    onOpenChange(false);
    navigate('/renting/reservas');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Seleccionar reserva</DialogTitle>
          <DialogDescription>
            Todo o contrato origina de uma reserva. Escolhe a reserva a converter em contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por código ou matrícula..."
            className="pl-9 bg-background"
            autoFocus
          />
        </div>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent sticky top-0 bg-card">
                <SortableTableHead
                  field="codigo"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-9 text-xs"
                >
                  Código
                </SortableTableHead>
                <SortableTableHead
                  field="matricula"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-9 text-xs"
                >
                  Matrícula
                </SortableTableHead>
                <SortableTableHead
                  field="cliente_nome"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-9 text-xs"
                >
                  Cliente
                </SortableTableHead>
                <SortableTableHead
                  field="data_inicio"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-9 text-xs"
                >
                  Data Início
                </SortableTableHead>
                <SortableTableHead
                  field="estado"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-9 text-xs"
                >
                  Estado
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingReservas ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : reservasElegiveis.length === 0 ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
                      <p>Sem reservas disponíveis para converter.</p>
                      <p className="text-xs">
                        Só reservas <strong>confirmadas</strong> ou <strong>em curso</strong>, com
                        cliente e viatura, sem contrato já criado.
                      </p>
                      <Button variant="link" size="sm" onClick={handleNovaReserva}>
                        Criar uma reserva primeiro
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                reservasElegiveis.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => handleSelect(r.id)}
                  >
                    <TableCell className="font-medium text-foreground">{r.codigo}</TableCell>
                    <TableCell className="text-foreground">{r.matricula ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.cliente_nome ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.data_inicio)}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {r.estado.replace('_', ' ')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={handleNovaReserva}>
            Criar nova reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
