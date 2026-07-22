import { useMemo, useState } from 'react';
import { ArrowRight, FileWarning, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { normalizeString } from '@/lib/utils';
import type { Motorista } from '@/types/motorista';

export interface MotoristaComCamposEmFalta {
  motorista: Motorista;
  camposEmFalta: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motoristas: MotoristaComCamposEmFalta[];
  onSelect: (motorista: Motorista) => void;
}

/** Dialog: motoristas com campos obrigatórios da ficha por preencher. */
export const MotoristasFichaIncompleta: React.FC<Props> = ({
  open,
  onOpenChange,
  motoristas,
  onSelect,
}) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string>('codigo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const filtered = useMemo(() => {
    const list = search.trim()
      ? motoristas.filter(({ motorista }) => {
          const t = normalizeString(search);
          return (
            normalizeString(motorista.nome).includes(t) ||
            motorista.codigo.toString().includes(search)
          );
        })
      : [...motoristas];

    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'codigo') {
        va = a.motorista.codigo;
        vb = b.motorista.codigo;
      } else if (sortField === 'nome') {
        va = a.motorista.nome;
        vb = b.motorista.nome;
      } else if (sortField === 'camposEmFalta') {
        va = a.camposEmFalta.length;
        vb = b.camposEmFalta.length;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [motoristas, search, sortField, sortDir]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-rose-600" />
            Motoristas com ficha incompleta
          </DialogTitle>
          <DialogDescription>
            {motoristas.length} motorista(s) com campos obrigatórios por preencher (NIF, email,
            IBAN, telefone ou documento de identificação). Clica num motorista para abrir a ficha e
            atualizar.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar código ou nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {motoristas.length === 0
                ? 'Todas as fichas estão completas!'
                : 'Nenhum resultado para a pesquisa.'}
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortableTableHead
                      field="codigo"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="w-[70px]"
                    >
                      Cód.
                    </SortableTableHead>
                    <SortableTableHead
                      field="nome"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    >
                      Nome
                    </SortableTableHead>
                    <SortableTableHead
                      field="camposEmFalta"
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                    >
                      Campos em falta
                    </SortableTableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(({ motorista, camposEmFalta }) => (
                    <TableRow
                      key={motorista.id}
                      className="cursor-pointer"
                      onClick={() => onSelect(motorista)}
                    >
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {motorista.codigo}
                      </TableCell>
                      <TableCell className="font-medium">{motorista.nome}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {camposEmFalta.map((campo) => (
                            <Badge
                              key={campo}
                              variant="outline"
                              className="text-rose-700 border-rose-300 dark:text-rose-400"
                            >
                              {campo}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
