import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fuel, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ContratoRenting } from '@/types/contratoRenting';

interface Props {
  contratos: ContratoRenting[];
  getClienteNome: (id: string | null | undefined) => string;
  getCondutorNome: (contratoId: string) => string;
}

/** Contratos marcados via o atalho "Any Rent" que ainda não têm dados de
 *  saída registados. Aproximação sem tipo de combustível da viatura (evita
 *  uma query por contrato só para um resumo/contagem) — o gate exato,
 *  ciente do tipo de combustível, é feito no banner do próprio contrato
 *  (AnyRentDadosSaidaAlert). */
export function contratosAnyRentPendentes(contratos: ContratoRenting[]): ContratoRenting[] {
  return contratos.filter(
    (c) =>
      c.entrega_via_any_rent &&
      (c.km_saida == null || (!c.combustivel_saida && !c.eletricidade_saida))
  );
}

export function AnyRentPendentesBanner({ contratos, getClienteNome, getCondutorNome }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const pendentes = useMemo(() => contratosAnyRentPendentes(contratos), [contratos]);

  if (pendentes.length === 0) return null;

  function irPara(id: string) {
    setOpen(false);
    navigate(`/renting/contratos/${id}`);
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
          <Fuel className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            <strong>
              {pendentes.length} {pendentes.length === 1 ? 'contrato' : 'contratos'} Any Rent
            </strong>{' '}
            por preencher
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
              <Fuel className="h-5 w-5 text-amber-600" /> Contratos Any Rent por preencher
            </DialogTitle>
            <DialogDescription>
              Contratos marcados como entregues via o atalho "Any Rent" (sem check-in) que ainda não
              têm km/combustível/bateria de saída registados. Clica num contrato para o abrir e
              preencher.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-6 flex-1 overflow-y-auto px-6">
            <ul className="divide-y divide-border">
              {pendentes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => irPara(c.id)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors"
                  >
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
