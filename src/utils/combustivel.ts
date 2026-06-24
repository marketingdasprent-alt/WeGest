export const COMBUSTIVEL_NIVEL_OPTS = ['Vazio', '1/4', '1/2', '3/4', 'Cheio'] as const;
export const ELETRICO_OPTS = ['0%', '25%', '50%', '75%', '100%'] as const;
export const GPL_OPTS = ['Vazio', '1/4', '1/2', '3/4', 'Cheio'] as const;

function norm(tipoCombustivel: string | null | undefined): string {
  // lowercase + remover acentos: o catálogo viatura_combustiveis guarda nomes
  // de exibição como "Elétrico"/"Híbrido" — o matching tem de os reconhecer.
  return (tipoCombustivel ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Combustão (ou tipo desconhecido) usa nível de combustível. */
export function precisaCombustivel(tipoCombustivel: string | null | undefined): boolean {
  const tc = norm(tipoCombustivel);
  return !tc || ['gasolina', 'diesel', 'hibrido', 'gasolina_gpl', 'diesel_gpl'].includes(tc);
}

/** Elétrico/híbrido têm bateria. */
export function precisaEletrico(tipoCombustivel: string | null | undefined): boolean {
  return ['eletrico', 'hibrido'].includes(norm(tipoCombustivel));
}

/** GPL/bi-fuel têm depósito de GPL. */
export function precisaGpl(tipoCombustivel: string | null | undefined): boolean {
  return ['gpl', 'gasolina_gpl', 'diesel_gpl'].includes(norm(tipoCombustivel));
}
