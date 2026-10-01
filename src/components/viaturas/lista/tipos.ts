import type { AcaoLinha } from '@/components/ui/acoes-linha';
import type { SituacaoViatura } from '@/utils/ocupantesViaturas';

/** O que a lista da Frota precisa de cada viatura. */
export interface ViaturaLinha {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  ano?: number | null;
  combustivel?: string | null;
  km_atual?: number | null;
  inspecao_validade?: string | null;
  seguro_validade?: string | null;
}

export interface ListaViaturasProps<V extends ViaturaLinha> {
  viaturas: readonly V[];
  estadoDe: (v: V) => string;
  situacoes?: ReadonlyMap<string, SituacaoViatura>;
  acoesDe: (v: V) => AcaoLinha[];
  onAbrir: (v: V) => void;
}
