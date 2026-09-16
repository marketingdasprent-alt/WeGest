import { ArrowRightLeft } from 'lucide-react';

import { useContratoEloAnterior } from '@/hooks/useContratoEloAnterior';

interface TrocaViaturaInfoProps {
  contratoId?: string | null;
}

function fmt(data: string | null | undefined): string | null {
  if (!data) return null;
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-PT');
}

// Em contratos encadeados, `data_inicio` pertence ao primeiro contrato; a data
// da troca vem de `substituido_em` e não pode substituir o início sem invalidar
// cadeias concluídas.
export const TrocaViaturaInfo: React.FC<TrocaViaturaInfoProps> = ({ contratoId }) => {
  const { data: anterior } = useContratoEloAnterior(contratoId);

  const trocadoEm = fmt(anterior?.substituido_em);
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
