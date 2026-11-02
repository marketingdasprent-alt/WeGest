// Avisos para não deixar contratos abertos de motoristas que já saíram: a
// inativação e a renovação são manuais e nada as cruzava (contratos #0385/#0720).

export interface CondutorComEstado {
  nome: string | null;
  status_ativo: boolean | null;
}

export interface ContratoEmCurso {
  codigo: number | null;
  matricula: string | null;
}

/** Nomes dos condutores já inativos. `null` conta como ativo (ficha sem estado). */
export function nomesMotoristasInativos(condutores: CondutorComEstado[]): string[] {
  return condutores
    .filter((c) => c.status_ativo === false)
    .map((c) => (c.nome ?? '').trim() || 'Motorista sem nome');
}

/** "#0385 · BO-86-BR" — rótulo de contrato usado nos avisos. */
export function rotuloContrato(c: ContratoEmCurso): string {
  const codigo = c.codigo != null ? `#${String(c.codigo).padStart(4, '0')}` : 'Sem código';
  return c.matricula ? `${codigo} · ${c.matricula}` : codigo;
}
