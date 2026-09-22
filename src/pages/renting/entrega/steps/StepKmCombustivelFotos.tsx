import { type NovoDano } from '@/components/renting/danos/DanosEditor';
import { RegistoViaturaSection } from '@/components/entrega/RegistoViaturaSection';

interface StepKmCombustivelFotosProps {
  titulo: string;
  km: string;
  onKmChange: (v: string) => void;
  /** KM registado na viatura — o novo não pode ser inferior. */
  kmMinimo?: number;
  combustivel: string;
  onCombustivelChange: (v: string) => void;
  eletricidade: string;
  onEletricidadeChange: (v: string) => void;
  /** Tipo de combustível da viatura (nome do catálogo) — decide que
   *  seletor(es) mostrar. null/undefined = ainda a carregar ou desconhecido,
   *  mostra combustível por omissão (comportamento anterior). */
  tipoCombustivel: string | null | undefined;
  danos: NovoDano[];
  onDanosChange: (danos: NovoDano[]) => void;
  viaturaId?: string | null;
  contratoId?: string | null;
}

/**
 * Registo do estado da viatura no fluxo /realizar.
 *
 * É só um alias do RegistoViaturaSection com o título do passo — o painel,
 * as cores e os campos vêm todos de lá, iguais ao fecho de contrato e ao
 * calendário. Continua a existir como ficheiro próprio porque a troca mostra
 * dois destes (viatura que sai e viatura que entra) e o /realizar chama-os
 * pelo barril `./steps`.
 *
 * Sem interruptor: aqui registar não é opcional, ao contrário do fecho, onde
 * se pode adiar a recolha para o Calendário.
 */
export const StepKmCombustivelFotos: React.FC<StepKmCombustivelFotosProps> = ({
  titulo,
  km,
  onKmChange,
  kmMinimo,
  combustivel,
  onCombustivelChange,
  eletricidade,
  onEletricidadeChange,
  tipoCombustivel,
  danos,
  onDanosChange,
  viaturaId,
  contratoId,
}) => (
  <RegistoViaturaSection
    titulo={titulo}
    viaturaId={viaturaId}
    contratoId={contratoId}
    tipoCombustivel={tipoCombustivel}
    km={km}
    onKmChange={onKmChange}
    kmMinimo={kmMinimo}
    combustivel={combustivel}
    onCombustivelChange={onCombustivelChange}
    nivelEletrico={eletricidade}
    onNivelEletricoChange={onEletricidadeChange}
    danos={danos}
    onDanosChange={onDanosChange}
  />
);
