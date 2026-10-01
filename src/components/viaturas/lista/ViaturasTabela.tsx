import { Car } from 'lucide-react';

import { AcoesLinha } from '@/components/ui/acoes-linha';
import { Badge } from '@/components/ui/badge';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getStatusBadgeClass, getStatusLabel } from '@/lib/viaturas';
import { ComQuemCelula, CombustivelCelula, DocumentosCelula } from './ViaturaCelulas';
import type { ListaViaturasProps, ViaturaLinha } from './tipos';

interface ViaturasTabelaProps<V extends ViaturaLinha> extends ListaViaturasProps<V> {
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (campo: string) => void;
  capas: ReadonlyMap<string, string>;
}

const COLUNAS: readonly { campo: string; titulo: string }[] = [
  { campo: 'matricula', titulo: 'Matrícula' },
  { campo: 'marca', titulo: 'Marca/Modelo' },
  { campo: 'ano', titulo: 'Ano' },
  { campo: 'combustivel', titulo: 'Combustível' },
  { campo: 'status', titulo: 'Estado' },
  { campo: 'com_quem', titulo: 'Com quem' },
  { campo: 'km_atual', titulo: 'Km' },
  { campo: 'documentos', titulo: 'Documentos' },
];

export function ViaturasTabela<V extends ViaturaLinha>({
  viaturas,
  estadoDe,
  situacoes,
  acoesDe,
  onAbrir,
  sortField,
  sortDir,
  onSort,
  capas,
}: ViaturasTabelaProps<V>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="h-10">
            <TableHead className="h-10 w-28">
              <span className="sr-only">Foto</span>
            </TableHead>
            {COLUNAS.map((c) => (
              <SortableTableHead
                key={c.campo}
                field={c.campo}
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                className="h-10"
              >
                {c.titulo}
              </SortableTableHead>
            ))}
            <TableHead className="h-10 text-right text-xs">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {viaturas.map((viatura) => {
            const estado = estadoDe(viatura);
            const capa = capas.get(viatura.id);
            return (
              <TableRow
                key={viatura.id}
                className="h-20 cursor-pointer hover:bg-muted/50"
                onClick={() => onAbrir(viatura)}
              >
                <TableCell className="w-28 py-2">
                  <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    {capa ? (
                      <img
                        src={capa}
                        alt={`Capa da viatura ${viatura.matricula}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Car className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-2 font-mono text-sm font-bold">
                  {viatura.matricula}
                </TableCell>
                <TableCell className="py-2 text-sm">
                  {viatura.marca} {viatura.modelo}
                </TableCell>
                <TableCell className="py-2 text-sm">{viatura.ano || 'N/D'}</TableCell>
                <TableCell className="py-2 text-sm">
                  <CombustivelCelula valor={viatura.combustivel} />
                </TableCell>
                <TableCell className="py-2">
                  <Badge variant="outline" className={`text-xs ${getStatusBadgeClass(estado)}`}>
                    {getStatusLabel(estado)}
                  </Badge>
                </TableCell>
                <TableCell className="py-2 text-sm">
                  <ComQuemCelula situacao={situacoes?.get(viatura.id)} estado={estado} />
                </TableCell>
                <TableCell className="py-2 text-sm">
                  {viatura.km_atual?.toLocaleString('pt-PT') || '0'}
                </TableCell>
                <TableCell className="py-2 text-sm">
                  <DocumentosCelula viatura={viatura} />
                </TableCell>
                <TableCell className="py-2 text-right">
                  {/* O botão "Abrir" permite chegar à viatura por teclado; a linha não recebe foco. */}
                  <AcoesLinha compacto alinhamento="fim" pararPropagacao acoes={acoesDe(viatura)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
