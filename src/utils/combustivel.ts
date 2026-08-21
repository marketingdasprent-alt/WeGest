// Oitavos acrescentados além dos quartos — a diferença entre "quase vazio"
// e "quase cheio" gera discussão com o motorista na entrega/recolha.
// "Reserva" (e não "Vazio") porque é o que o painel mostra: o depósito nunca
// está literalmente a zero quando a viatura ainda anda.
export const COMBUSTIVEL_NIVEL_OPTS = [
  'Reserva',
  '1/8',
  '1/4',
  '3/8',
  '1/2',
  '3/4',
  '7/8',
  'Cheio',
] as const;
/**
 * Atalhos para a bateria. Deixaram de ser as únicas opções — o nível escreve-se
 * livremente (ver normalizarPercentagem) porque um carro entregue a 73% não é
 * 75%, e a diferença discute-se na devolução. Ficam como atalho para os casos
 * redondos, que são a maioria.
 */
export const ELETRICO_OPTS = ['0%', '25%', '50%', '75%', '100%'] as const;

/**
 * Põe o que a pessoa escreveu na forma que fica guardada e impressa: `"73%"`.
 *
 * Aceita com ou sem `%`, com vírgula ou ponto, e trava entre 0 e 100 — uma
 * bateria a 150% é engano de dedo, não um dado a gravar na folha de danos.
 * Devolve string vazia para lixo, para o campo ficar por preencher em vez de
 * guardar disparates.
 */
export function normalizarPercentagem(entrada: string | null | undefined): string {
  const cru = (entrada ?? '').trim().replace('%', '').replace(',', '.');
  if (!cru) return '';
  const n = Number(cru);
  if (!Number.isFinite(n)) return '';
  return `${Math.min(100, Math.max(0, Math.round(n)))}%`;
}
export const GPL_OPTS = ['Vazio', '1/4', '1/2', '3/4', 'Cheio'] as const;

function norm(tipoCombustivel: string | null | undefined): string {
  // lowercase + remover acentos: o catálogo viatura_combustiveis guarda nomes
  // de exibição como "Elétrico" / "Híbrido/Gasolina".
  return (tipoCombustivel ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Matching por SUBSTRING (não igualdade): os nomes do catálogo são descritivos,
// ex.: "Híbrido Plug-in", "Híbrido/Diesel", "Bi-Fuel - Gasolina/GPL".

/** Tem motor de combustão (gasolina/diesel/híbrido), ou tipo desconhecido. */
export function precisaCombustivel(tipoCombustivel: string | null | undefined): boolean {
  const tc = norm(tipoCombustivel);
  if (!tc) return true;
  return tc.includes('gasolina') || tc.includes('diesel') || tc.includes('hibrid');
}

/** Tem bateria (elétrico ou híbrido). */
export function precisaEletrico(tipoCombustivel: string | null | undefined): boolean {
  const tc = norm(tipoCombustivel);
  return tc.includes('eletric') || tc.includes('hibrid');
}

/** Tem depósito de GPL (GPL ou bi-fuel). */
export function precisaGpl(tipoCombustivel: string | null | undefined): boolean {
  return norm(tipoCombustivel).includes('gpl');
}

/**
 * O que escrever no campo de nível de energia de uma folha de danos ou PDF.
 *
 * As folhas lêem `combustivel_saida`/`combustivel_entrada`, mas numa viatura
 * eléctrica o nível está guardado em `eletricidade_*` — o campo saía em branco
 * e o motorista assinava uma folha sem o dado que mais gera discussão na
 * devolução. Isto resolve pelo tipo da viatura, sem obrigar as organizações a
 * editar os templates que já têm.
 *
 * Híbridas devolvem os dois valores: têm mesmo depósito e bateria, e um único
 * campo não pode fingir que só têm um. Se só um lado estiver preenchido, sai
 * esse — nunca um separador solto.
 */
export function nivelEnergia(
  tipoCombustivel: string | null | undefined,
  valores: { combustivel?: string | null; eletricidade?: string | null }
): string {
  const partes: string[] = [];

  const comb = valores.combustivel?.trim();
  if (comb && precisaCombustivel(tipoCombustivel)) partes.push(comb);

  const elec = valores.eletricidade?.trim();
  if (elec && precisaEletrico(tipoCombustivel)) partes.push(elec);

  return partes.join(' · ');
}
