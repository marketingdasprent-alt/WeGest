import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { contratosPorRenovar, prazoRenovacao } from '@/lib/renovacaoContrato';
import type { ContratoRenting } from '@/types/contratoRenting';

interface Props {
  contratos: ContratoRenting[];
  getClienteNome: (id: string | null | undefined) => string;
  getCondutorNome: (contratoId: string) => string;
}

export function RenovacoesBanner({ contratos, getClienteNome, getCondutorNome }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const porRenovar = useMemo(() => contratosPorRenovar(contratos), [contratos]);
  const nAtraso = porRenovar.filter((p) => p.estado === 'atraso').length;
  const nHoje = porRenovar.filter((p) => p.estado === 'hoje').length;

  if (porRenovar.length === 0) return null;

  const partes: string[] = [];
  if (nAtraso > 0) partes.push(`${nAtraso} em atraso`);
  if (nHoje > 0) partes.push(`${nHoje} hoje`);

  function irPara(id: string) {
    setOpen(false);
    navigate(`/renting/contratos/${id}`);
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            <strong>
              {porRenovar.length} {porRenovar.length === 1 ? 'contrato' : 'contratos'} por renovar
            </strong>
            {partes.length > 0 && (
              <span className="text-amber-700/80"> · {partes.join(' · ')}</span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/50 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
          onClick={() => setOpen(true)}
        >
          Ver contratos
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-600" /> Contratos por renovar
            </DialogTitle>
            <DialogDescription>
              Contratos de longa duração (Rent-a-Car e TVDE) cuja renovação chegou ou está em atraso
              — o TVDE renova a cada 30 dias. Clica num contrato para o abrir e renovar.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-6 flex-1 overflow-y-auto px-6">
            <ul className="divide-y divide-border">
              {porRenovar.map(({ contrato: c, estado }) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => irPara(c.id)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 border',
                        estado === 'atraso'
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      )}
                    >
                      {estado === 'atraso' ? 'Em atraso' : 'Hoje'}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        Contrato #{String(c.codigo).padStart(4, '0')}
                        {c.matricula ? ` · ${c.matricula}` : ''}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {getCondutorNome(c.id) !== '—'
                          ? getCondutorNome(c.id)
                          : getClienteNome(c.cliente_id)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {/* data_fim, ou prazo virtual (início + 30d) em TVDE sem data_fim */}
                      Renova {formatDate((prazoRenovacao(c) ?? new Date()).toISOString())}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
