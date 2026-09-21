import { precisaCombustivel, precisaEletrico } from '@/utils/combustivel';
import type { ContratoRenting } from '@/types/contratoRenting';

type ContratoDadosSaida = Pick<
  ContratoRenting,
  | 'estado_operacional'
  | 'entrega_via_any_rent'
  | 'km_saida'
  | 'combustivel_saida'
  | 'eletricidade_saida'
>;

/**
 * Contrato aberto por quem, no check-in, carregou em "Não tenho os dados" — a
 * entrega aconteceu, o contrato está em curso, mas a folha de danos ficou por
 * preencher. Entregas via "Any Rent" ficam de fora de propósito: têm o seu
 * próprio alerta (AnyRentDadosSaidaAlert), com outro texto e outra origem.
 *
 * `tipoCombustivel` desconhecido (null/undefined) assume viatura a combustão —
 * o mesmo que AnyRentDadosSaidaAlert faz, para não esconder o alerta enquanto
 * a query do tipo de viatura não resolve.
 */
export function folhaDanosPendente(
  contrato: ContratoDadosSaida,
  tipoCombustivel: string | null | undefined
): boolean {
  if (contrato.estado_operacional !== 'em_curso') return false;
  if (contrato.entrega_via_any_rent) return false;

  const exigeCombustivel = tipoCombustivel == null || precisaCombustivel(tipoCombustivel);
  const exigeEletrico = precisaEletrico(tipoCombustivel);

  return (
    contrato.km_saida == null ||
    (exigeCombustivel && !contrato.combustivel_saida) ||
    (exigeEletrico && !contrato.eletricidade_saida)
  );
}

/**
 * Versão de lista: aproximação sem o tipo de combustível de cada viatura
 * (evita uma query por contrato só para uma contagem) — o gate exacto é o do
 * banner do próprio contrato. Mesma aproximação de contratosAnyRentPendentes.
 */
export function contratosFolhaDanosPendentes(contratos: ContratoRenting[]): ContratoRenting[] {
  return contratos.filter(
    (c) =>
      c.estado_operacional === 'em_curso' &&
      !c.entrega_via_any_rent &&
      (c.km_saida == null || (!c.combustivel_saida && !c.eletricidade_saida))
  );
}
