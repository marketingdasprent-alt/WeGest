import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarX, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/utils/formatters';
import { contratosExpiradosSemRenovacao } from '@/lib/renovacaoContrato';
import type { ContratoRenting } from '@/types/contratoRenting';


interface Props {
  contratos: ContratoRenting[];
  getClienteNome: (id: string | null | undefined) => string;
  getCondutorNome: (contratoId: string) => string;
}

/**
 * Contratos em curso cuja data de fim já passou e que NÃO são de longa
 * duração — rent-a-car de período fixo.
 *
 * O RenovacoesBanner só olha para os renováveis (`contratoRenovavel` exige
 * is_longa_duracao), por isso estes não apareciam em aviso nenhum: ficavam
 * "em curso" indefinidamente, com a viatura ocupada e sem período válido que
 * gerasse aluguer. Não há renovação a propor — o que há a fazer é fechar o
 * contrato ou acordar novas datas, e por isso vive num banner próprio em vez
 * de se misturar com "por renovar".
 */
export function ExpiradosSemRenovacaoBanner({
  contratos,
  getClienteNome,
  getCondutorNome,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const expirados = useMemo(() => contratosExpiradosSemRenovacao(contratos), [contratos]);

  if (expirados.length === 0) return null;

  function irPara(id: string) {
    setOpen(false);
    navigate(`/renting/contratos/${id}`);
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-300">
          <CalendarX className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            <strong>
              {expirados.length} {expirados.length === 1 ? 'contrato' : 'contratos'} em curso com o
              prazo terminado
            </strong>
            <span className="block text-rose-700/90 dark:text-rose-300/80">
              A viatura continua ocupada e o período já não gera aluguer. Fechar o contrato ou
              acordar novas datas.
            </span>
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-rose-500/50 text-rose-800 hover:bg-rose-500/20 dark:text-rose-200"
          onClick={() => setOpen(true)}
        >
          Ver contratos
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarX className="h-5 w-5 text-rose-600" /> Contratos com o prazo terminado
            </DialogTitle>
            <DialogDescription>
              Contratos de período fixo que continuam em curso depois da data de fim. Não têm
              renovação automática a propor: ou se fecham, ou se acordam datas novas. Enquanto
              ficarem assim, as semanas seguintes contam zero de aluguer nos resumos.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-6 flex-1 overflow-y-auto px-6">
            <ul className="divide-y divide-border">
              {expirados.map((c) => (
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
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      Terminou {c.data_fim ? formatDate(c.data_fim) : '—'}
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
