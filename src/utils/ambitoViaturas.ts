/**
 * Âmbito de viaturas por cargo: com que parte da frota cada grupo trabalha.
 *
 * Regra fixa no código (decisão de 30/09): Gestor TVDE e Supervisor Gestor TVDE
 * trabalham com TVDE + SLOT. Os restantes cargos, e qualquer admin, vêem tudo.
 * É um filtro por omissão, não segurança — há sempre "Ver toda a frota".
 */

export interface AmbitoViaturas {
  /** Rótulo curto para o ecrã ("TVDE"). */
  nome: string;
  /** Nomes de `viatura_tipos`, normalizados. */
  tiposViatura: readonly string[];
  /** Viaturas com `is_slot` entram mesmo sem tipo. */
  incluiSlot: boolean;
  /** Regimes de contrato/reserva que pertencem ao âmbito. */
  regimes: readonly string[];
  /** Cartões da página Viaturas que não interessam a este grupo. */
  cartoesOcultos: readonly CartaoViaturas[];
}

export type CartaoViaturas = 'inativas' | 'todos_os_tipos' | 'tipos';

const AMBITO_TVDE: AmbitoViaturas = {
  nome: 'TVDE',
  tiposViatura: ['tvde', 'slot'],
  incluiSlot: true,
  regimes: ['tvde', 'slot'],
  // Pedido do Thiago (30/09): na frota TVDE só interessam os estados e o SLOT.
  cartoesOcultos: ['inativas', 'todos_os_tipos', 'tipos'],
};

/** Cargo (nome normalizado) → âmbito. Cada org escreve o cargo à sua maneira. */
const AMBITO_POR_CARGO: Record<string, AmbitoViaturas> = {
  'gestor tvde': AMBITO_TVDE,
  'supervisor gestor tvde': AMBITO_TVDE,
};

export function normalizarNome(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `null` = sem âmbito, vê a frota toda. O admin nunca tem âmbito. Com vários
 * grupos só há âmbito se TODOS tiverem: basta um grupo sem âmbito para ver tudo.
 */
export function ambitoDoUtilizador(p: {
  isAdmin: boolean;
  cargo: string | null | undefined;
  cargos?: readonly string[];
}): AmbitoViaturas | null {
  if (p.isAdmin) return null;
  const grupos = p.cargos && p.cargos.length > 0 ? p.cargos : [p.cargo];
  const ambitos = grupos.map((g) => AMBITO_POR_CARGO[normalizarNome(g)] ?? null);
  if (ambitos.some((a) => a === null)) return null;
  return ambitos[0];
}

/** Viatura sem tipo nunca entra num âmbito — só o admin (ou "toda a frota") a vê. */
export function viaturaNoAmbito(
  v: { isSlot?: boolean | null; tipoNome?: string | null },
  ambito: AmbitoViaturas | null
): boolean {
  if (!ambito) return true;
  if (ambito.incluiSlot && v.isSlot) return true;
  const tipo = normalizarNome(v.tipoNome);
  return tipo !== '' && ambito.tiposViatura.includes(tipo);
}

/**
 * Contrato ou reserva: entra pelo regime OU pela viatura. O regime decide
 * mesmo com a viatura sem tipo ou ainda por atribuir (reserva sem carro).
 */
export function negocioNoAmbito(
  n: { regime?: string | null; viaturaId?: string | null },
  ambito: AmbitoViaturas | null,
  viaturasNoAmbito: ReadonlySet<string>
): boolean {
  if (!ambito) return true;
  if (n.regime && ambito.regimes.includes(normalizarNome(n.regime))) return true;
  return !!n.viaturaId && viaturasNoAmbito.has(n.viaturaId);
}

/** Matrícula comparável: sem hífens nem espaços, maiúsculas. */
export function chaveMatricula(m: string | null | undefined): string {
  return (m ?? '').replace(/[-\s]/g, '').toUpperCase();
}

/** Matrícula portuguesa no início do título (ex.: "BT-14-UM · recolha"). */
export function matriculaNoTitulo(titulo: string | null | undefined): string | null {
  const m = (titulo ?? '').match(/^([A-Z0-9]{2})[-\s]?([A-Z0-9]{2})[-\s]?([A-Z0-9]{2})\b/i);
  return m ? `${m[1]}${m[2]}${m[3]}`.toUpperCase() : null;
}

/**
 * Evento do calendário: entra se a viatura (pela matrícula) estiver no âmbito.
 * Eventos sem viatura — notas, reuniões — aparecem sempre.
 */
export function eventoNoAmbito(
  e: { matricula_devolver?: string | null; titulo?: string | null },
  ambito: AmbitoViaturas | null,
  matriculasNoAmbito: ReadonlySet<string>
): boolean {
  if (!ambito) return true;
  const matricula = chaveMatricula(e.matricula_devolver) || matriculaNoTitulo(e.titulo);
  if (!matricula) return true;
  return matriculasNoAmbito.has(matricula);
}
