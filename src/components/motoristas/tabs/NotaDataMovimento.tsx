import { addDays, endOfWeek, format, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Info } from 'lucide-react';

/**
 * Nota junto ao campo de data: a regra é contra-intuitiva e já custou dinheiro
 * (a data do movimento define a semana a cobrar, não o dia em que se lança).
 * Exemplo calculado com a data de hoje para se perceber à primeira.
 */
export function NotaDataMovimento() {
  const hoje = new Date();
  const inicioSemana = startOfWeek(hoje, { weekStartsOn: 1 });
  const fimSemana = endOfWeek(hoje, { weekStartsOn: 1 });
  const proximaSegunda = addDays(inicioSemana, 7);

  const dia = (d: Date) => format(d, 'd/MM', { locale: pt });
  const diaLongo = (d: Date) => format(d, "d 'de' MMMM", { locale: pt });

  return (
    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1.5">
        <p>
          <strong>A data escolhe a semana em que o valor é descontado.</strong> Cada resumo vai de
          segunda a domingo e é acertado na segunda-feira seguinte.
        </p>
        <p>
          Para cobrar na semana de{' '}
          <strong>
            {dia(inicioSemana)} a {dia(fimSemana)}
          </strong>
          , a data tem de ficar entre esses dias. Esse valor sai no acerto de{' '}
          <strong>{diaLongo(proximaSegunda)}</strong>.
        </p>
        <p>
          Atenção ao engano mais comum: pôr a data da segunda-feira em que estás a fazer o acerto
          atira o valor para a semana <em>seguinte</em>, porque essa segunda já é o primeiro dia do
          período novo.
        </p>
        <p>
          Depois de lançado, só o estado <strong>Cancelado</strong> tira o valor do resumo. Marcar
          como <strong>Pago</strong> não o remove — o resumo é onde a cobrança acontece, e o
          pagamento regista-se depois de a semana fechar.
        </p>
      </div>
    </div>
  );
}
