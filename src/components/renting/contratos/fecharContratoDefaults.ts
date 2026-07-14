import { isoToLocalInput } from './contratoForm.schema';

interface ComputeFechoRapidoDefaultsParams {
  motoristaId?: string | null;
  estacaoOrigemViaturaId?: string | null;
  estacoesDisponiveisIds: string[];
  agoraIso: string;
}

interface FechoRapidoDefaults {
  tipoEvento: 'recolhido' | 'devolvido';
  estacaoId: string | undefined;
  dataEvento: string;
}

/** Defaults do fecho rápido — reduz cliques sem remover nenhum campo obrigatório.
 *  'devolvido' quando há motorista (o condutor devolveu a viatura); 'recolhido'
 *  quando não há (rent-a-car simples, a empresa recolhe directamente). */
export function computeFechoRapidoDefaults({
  motoristaId,
  estacaoOrigemViaturaId,
  estacoesDisponiveisIds,
  agoraIso,
}: ComputeFechoRapidoDefaultsParams): FechoRapidoDefaults {
  const estacaoId =
    estacaoOrigemViaturaId && estacoesDisponiveisIds.includes(estacaoOrigemViaturaId)
      ? estacaoOrigemViaturaId
      : undefined;

  return {
    tipoEvento: motoristaId ? 'devolvido' : 'recolhido',
    estacaoId,
    dataEvento: isoToLocalInput(agoraIso),
  };
}
