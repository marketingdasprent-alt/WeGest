import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { formatCurrency } from '@/utils/formatters';
import { useViaturaResumoSemanal } from '@/hooks/useViaturaResumoSemanal';

interface ViaturaFinanceiraSemanalProps {
  viaturaId: string;
}

function fmtSemana(inicio: string, fim: string): string {
  return `${format(parseISO(inicio), 'dd/MM')} - ${format(parseISO(fim), 'dd/MM')}`;
}

export function ViaturaFinanceiraSemanal({ viaturaId }: ViaturaFinanceiraSemanalProps) {
  const { semanas, loading } = useViaturaResumoSemanal(viaturaId);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">A carregar...</CardContent>
      </Card>
    );
  }

  if (semanas.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Resumo semanal começa a ser gerado a partir da próxima 2ª-feira.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Accordion type="single" collapsible className="w-full">
          {semanas.map((s) => (
            <AccordionItem key={s.id} value={s.id}>
              <AccordionTrigger>
                <div className="flex w-full items-center justify-between pr-4 text-sm">
                  <span className="font-medium">{fmtSemana(s.semanaInicio, s.semanaFim)}</span>
                  <div className="flex gap-6">
                    <span className="text-green-600">{formatCurrency(s.receitaTotal)}</span>
                    <span className="text-red-600">{formatCurrency(s.despesaTotal)}</span>
                    <span className="font-semibold">{formatCurrency(s.saldo)}</span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-3 gap-4 py-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">Aluguer (contrato)</div>
                    <div>{formatCurrency(s.receitaAluguer)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Multas</div>
                    <div>{formatCurrency(s.despesaOutros)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Danos</div>
                    <div>{formatCurrency(s.despesaDanos)}</div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
