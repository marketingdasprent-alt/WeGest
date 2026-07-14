import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CheckCircle2 } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { formatMatricula } from '@/components/calendario/calendarioUtils';
import { tipoLabel, type TipoEvento } from '@/utils/entrega';

interface InfoEvento {
  tipo: TipoEvento;
  matricula: string;
  matricula_devolver?: string | null;
  cidade?: string | null;
  data_inicio: string;
}

interface StepDadosIniciaisProps {
  info: InfoEvento;
  /** Botão de confirmação (filho) — o StickyPageHeader inclui render {children} */
  acaoBotao?: React.ReactNode;
  isPending: boolean;
}

/**
 * Cabeçalho com dados do evento + card informativo para trocas.
 * Corresponde aos steps "dados_iniciais" + "viatura" (info geral).
 */
export const StepDadosIniciais: React.FC<StepDadosIniciaisProps> = ({
  info,
  acaoBotao,
  isPending,
}) => {
  const matricula = formatMatricula(info.matricula);
  const matriculaDevolver = info.matricula_devolver
    ? formatMatricula(info.matricula_devolver)
    : null;
  const isTroca = info.tipo === 'troca';

  return (
    <>
      <StickyPageHeader
        title={`Realizar ${tipoLabel(info.tipo)}`}
        description={`${isTroca && matriculaDevolver ? `${matriculaDevolver} ↔ ${matricula}` : matricula}${info.cidade ? ` · ${info.cidade}` : ''} · ${format(
          new Date(info.data_inicio),
          "dd/MM 'às' HH:mm",
          { locale: pt }
        )}`}
        icon={CheckCircle2}
      >
        {acaoBotao}
      </StickyPageHeader>

      <div className="space-y-4 pb-4">
        {info.tipo === 'troca' && matriculaDevolver && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 text-sm">
              <span className="font-medium">Troca de viatura:</span> devolver{' '}
              <span className="font-semibold">{matriculaDevolver}</span> e entregar{' '}
              <span className="font-semibold">{matricula}</span>. Os dados abaixo (km, combustível,
              danos) referem-se à viatura entregue ({matricula}).
            </CardContent>
          </Card>
        )}

        {/* Os restantes steps são injetados como children depois do header */}
      </div>
    </>
  );
};
