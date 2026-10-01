import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
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
import { contratosTerminamHoje } from '@/lib/renovacaoContrato';

import type { ContratoRenting } from '@/types/contratoRenting';

interface Props {
  contratos: ContratoRenting[];
  getClienteNome: (id: string | null | undefined) => string;
  getCondutorNome: (contratoId: string) => string;
  /** Dia de referência. Só os testes o passam; em produção é o dia de hoje. */
  hoje?: Date;
}

const ESTADO_LABEL: Record<string, string> = {
  em_curso: 'Em curso',
  agendado: 'Agendado',
};

/**
 * O botão "Terminam hoje (N)" da lista de contratos, e o diálogo que abre.
 *
 * É um botão e não um banner de propósito: os dois banners que já existem
 * (renovações, expirados) empurram a lista para baixo sempre que há algo, e
 * um terceiro fazia a página abrir com três avisos antes de se ver um
 * contrato. Aqui a contagem fica à vista na barra e o resto só aparece a
 * pedido.
 *
 * Não filtra por renovável — ver contratosTerminamHoje. Sem nada a terminar
 * não desenha nada: um botão a dizer "(0)" só ocupa espaço.
 */
export function ContratosTerminamHojeDialog({
  contratos,
  getClienteNome,
  getCondutorNome,
  hoje,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const terminam = useMemo(() => contratosTerminamHoje(contratos, hoje), [contratos, hoje]);

  if (terminam.length === 0) return null;

  const n = terminam.length;

  function irPara(id: string) {
    setOpen(false);
    navigate(`/renting/contratos/${id}`);
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <CalendarClock className="h-4 w-4" />
        {n === 1 ? 'Termina hoje' : 'Terminam hoje'} ({n})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              {n === 1 ? 'Contrato que termina hoje' : `${n} contratos que terminam hoje`}
            </DialogTitle>
            <DialogDescription>
              Todos os contratos vivos cuja data de fim é hoje, de longa ou curta duração. Clica num
              contrato para o abrir — e renovar, fechar ou acordar datas novas.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-6 flex-1 overflow-y-auto px-6">
            <ul className="divide-y divide-border">
              {terminam.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => irPara(c.id)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors"
                  >
                    <Badge variant="outline" className="shrink-0">
                      {ESTADO_LABEL[c.estado_operacional] ?? c.estado_operacional}
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
                      {c.data_fim ? `Termina ${formatDate(c.data_fim)}` : ''}
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
