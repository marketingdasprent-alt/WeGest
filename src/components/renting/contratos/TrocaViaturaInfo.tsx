import { ArrowRightLeft } from 'lucide-react';

import { useContratoEloAnterior } from '@/hooks/useContratoEloAnterior';

interface TrocaViaturaInfoProps {
  /** Contrato em edição. Sem ele não há nada a mostrar (contrato novo). */
  contratoId?: string | null;
}

function fmt(data: string | null | undefined): string | null {
  if (!data) return null;
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-PT');
}

/**
 * Data da troca de viatura, no contrato que nasceu dela.
 *
 * O contrato mostra a `data_inicio`, que numa troca é herdada do elo anterior —
 * ou seja, o início do PRIMEIRO contrato, não o momento em que esta viatura
 * entrou. A data da troca existe (`substituido_em` do elo anterior) mas não
 * aparecia em lado nenhum na ficha do contrato.
 *
 * Nem sempre dá para corrigir a `data_inicio`: em 13 das 25 cadeias em
 * produção a troca foi feita depois de o contrato já ter terminado, e empurrar
 * o início daria início posterior ao fim. Por isso mostra-se em vez de
 * reescrever — as duas datas são factos diferentes e ambos verdadeiros.
 */
export const TrocaViaturaInfo: React.FC<TrocaViaturaInfoProps> = ({ contratoId }) => {
  const { data: anterior } = useContratoEloAnterior(contratoId);

  const trocadoEm = fmt(anterior?.substituido_em);
  // Sem data de troca não há nada de útil a dizer — não se ocupa espaço com
  // uma linha vazia.
  if (!anterior || !trocadoEm) return null;

  const desde = fmt(anterior.data_inicio);

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
      <span>
        Viatura trocada em <span className="font-medium text-foreground">{trocadoEm}</span>
      </span>
      {anterior.matricula && (
        <span>
          — antes <span className="font-mono font-medium">{anterior.matricula}</span>
          {desde && `, desde ${desde}`}
        </span>
      )}
    </p>
  );
};
