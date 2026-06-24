export const COMBUSTIVEL_NIVEL_OPTS = ['Vazio', '1/4', '1/2', '3/4', 'Cheio'] as const;
export const ELETRICO_OPTS = ['0%', '25%', '50%', '75%', '100%'] as const;
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
