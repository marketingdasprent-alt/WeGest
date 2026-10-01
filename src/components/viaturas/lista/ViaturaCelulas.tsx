import { format, parseISO } from 'date-fns';
import { AlertTriangle, Briefcase, Flame, Fuel, Leaf, UserRound, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { alertasDocumentos, textoAlerta } from '@/utils/documentosViatura';
import { SEM_INFO, grupoCombustivel, rotuloCombustivel } from '@/utils/filtrosViaturas';
import { diasLivre, type SituacaoViatura } from '@/utils/ocupantesViaturas';

const ICONE_COMBUSTIVEL: Record<string, LucideIcon> = {
  eletrico: Zap,
  hibrido: Leaf,
  gpl: Flame,
  diesel: Fuel,
  gasolina: Fuel,
};

export function CombustivelCelula({ valor }: { valor: string | null | undefined }) {
  const grupo = grupoCombustivel(valor);
  if (grupo === SEM_INFO) return <span className="text-muted-foreground">N/D</span>;
  const Icone = ICONE_COMBUSTIVEL[grupo] ?? Fuel;
  return (
    <span className="inline-flex items-center gap-1.5" title={valor ?? undefined}>
      <Icone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {rotuloCombustivel(grupo)}
    </span>
  );
}

interface ComQuemCelulaProps {
  situacao?: SituacaoViatura;
  estado: string;
  hoje?: Date;
}

/** Quem tem a viatura; se está disponível, há quanto tempo está parada. */
export function ComQuemCelula({ situacao, estado, hoje }: ComQuemCelulaProps) {
  const ocupante = situacao?.ocupante;
  if (ocupante) {
    const Icone = ocupante.tipo === 'motorista' ? UserRound : Briefcase;
    return (
      <span className="inline-flex max-w-[14rem] items-center gap-1.5">
        <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate" title={ocupante.nome}>
          {ocupante.nome}
        </span>
      </span>
    );
  }
  if (estado !== 'disponivel') return <span className="text-muted-foreground">—</span>;

  const dias = diasLivre(situacao?.livreDesde, hoje);
  if (dias === null) return <span className="text-muted-foreground">Livre · sem histórico</span>;
  if (dias < 0 && situacao?.livreDesde) {
    return (
      <span className="text-amber-600">
        Fim marcado a {format(parseISO(situacao.livreDesde.slice(0, 10)), 'dd/MM')}
      </span>
    );
  }
  // Parada há muito é dinheiro perdido: amarelo a partir de 7 dias, vermelho a partir de 30.
  return (
    <span
      className={cn(
        'font-medium',
        dias >= 30 ? 'text-destructive' : dias >= 7 ? 'text-amber-600' : 'text-green-600'
      )}
    >
      {dias === 0 ? 'Livre desde hoje' : `Livre há ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
    </span>
  );
}

interface DocumentosCelulaProps {
  viatura: { inspecao_validade?: string | null; seguro_validade?: string | null };
  hoje?: Date;
}

const data = (d: string | null | undefined) => (d ? format(parseISO(d), 'dd/MM/yyyy') : 'N/D');

/** O documento mais urgente (vencido a vermelho, a vencer a amarelo); senão "Em dia". */
export function DocumentosCelula({ viatura, hoje }: DocumentosCelulaProps) {
  const alertas = alertasDocumentos(viatura, hoje);
  const detalhe = `Inspeção: ${data(viatura.inspecao_validade)} · Seguro: ${data(viatura.seguro_validade)}`;
  if (alertas.length === 0) {
    const semDatas = !viatura.inspecao_validade && !viatura.seguro_validade;
    return (
      <span className="text-muted-foreground" title={detalhe}>
        {semDatas ? 'Sem datas' : 'Em dia'}
      </span>
    );
  }
  const [principal] = alertas;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        principal.vencido ? 'text-destructive' : 'text-amber-600'
      )}
      title={detalhe}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {textoAlerta(principal)}
      {alertas.length > 1 && <span className="text-xs opacity-80">+1</span>}
    </span>
  );
}
