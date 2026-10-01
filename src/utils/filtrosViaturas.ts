import { ESTADOS_EM_USO } from '@/lib/viaturas';
import { alertasDocumentos } from '@/utils/documentosViatura';

/** Filtros da página Viaturas (vivem no URL). 'all' = sem filtro. */
export interface FiltrosViaturas {
  search: string;
  status: string;
  categoria: string;
  combustivel: string;
  tipo: string;
}

export type FacetaViaturas = 'status' | 'categoria' | 'combustivel';

export interface ViaturaFiltravel {
  matricula?: string | null;
  marca?: string | null;
  modelo?: string | null;
  categoria?: string | null;
  combustivel?: string | null;
  tipo_id?: string | null;
  is_slot?: boolean | null;
  is_vendida?: boolean | null;
  inspecao_validade?: string | null;
  seguro_validade?: string | null;
  /** Motorista ou cliente que tem a viatura — também se pesquisa por ele. */
  ocupante_nome?: string | null;
}

export interface OpcaoFiltro {
  value: string;
  label: string;
  count?: number;
}

/** Valor do filtro para "campo por preencher" — ajuda a encontrar fichas incompletas. */
export const SEM_INFO = 'sem_info';

const ESTADOS: readonly OpcaoFiltro[] = [
  { value: 'all', label: 'Todos' },
  { value: 'atencao', label: 'Precisa de atenção' },
  { value: 'disponivel', label: 'Disponível' },
  { value: 'em_uso', label: 'Em uso (todas)' },
  { value: 'alugadas', label: 'Alugadas' },
  { value: 'em_tvde', label: 'Em TVDE' },
  { value: 'em_slot', label: 'Em slot' },
  { value: 'em_contrato', label: 'Em contrato' },
  { value: 'em_reserva', label: 'Em reserva' },
  { value: 'em_movimentacao', label: 'Em movimentação' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'inativo', label: 'Inativas' },
  { value: 'vendido', label: 'Vendidas' },
  { value: 'todos_vendidos', label: 'Todas (com vendidas)' },
];

const COMBUSTIVEIS: Record<string, string> = {
  eletrico: 'Elétrico',
  hibrido: 'Híbrido',
  gpl: 'GPL (Bi-Fuel)',
  diesel: 'Diesel',
  gasolina: 'Gasolina',
};

const CATEGORIAS: Record<string, string> = {
  green: 'Green',
  comfort: 'Comfort',
  black: 'Black',
  'x-saver': 'X-Saver',
};

const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function normalizeSearch(s: string | null | undefined): string {
  return semAcentos(s ?? '').replace(/[-\s]/g, '');
}

/**
 * A BD tem o mesmo combustível escrito de várias maneiras ("Elétrico"/"eletrico",
 * "Híbrido/Gasolina", "Bi-Fuel - Gasolina/GPL"…). Agrupa-se pelo que importa.
 * A ordem conta: um híbrido a gasolina é híbrido; um bi-fuel é GPL.
 */
export function grupoCombustivel(valor: string | null | undefined): string {
  const v = semAcentos(valor ?? '').trim();
  if (!v) return SEM_INFO;
  if (v.includes('eletr')) return 'eletrico';
  if (v.includes('hibrid')) return 'hibrido';
  if (v.includes('gpl') || v.includes('bi-fuel') || v.includes('bifuel')) return 'gpl';
  if (v.includes('diesel')) return 'diesel';
  if (v.includes('gasolina')) return 'gasolina';
  return v;
}

function grupoCategoria(valor: string | null | undefined): string {
  return (valor ?? '').trim().toLowerCase() || SEM_INFO;
}

/** Nome a mostrar para um grupo de combustível (ver grupoCombustivel). */
export function rotuloCombustivel(grupo: string): string {
  return rotulo(grupo, COMBUSTIVEIS);
}

function rotulo(grupo: string, conhecidos: Record<string, string>): string {
  if (grupo === SEM_INFO) return 'Sem informação';
  return conhecidos[grupo] ?? grupo.charAt(0).toUpperCase() + grupo.slice(1);
}

/** O estado escolhido deixa passar a viatura? Trata vendidas e os agregados. */
export function passaEstado<V extends ViaturaFiltravel>(
  v: V,
  status: string,
  estadoDe: (v: V) => string
): boolean {
  if (status === 'todos_vendidos') return true;
  if (status === 'vendido') return !!v.is_vendida;
  if (v.is_vendida) return false;
  if (status === 'all') return true;
  const estado = estadoDe(v);
  const emUso = (ESTADOS_EM_USO as readonly string[]).includes(estado);
  if (status === 'em_uso') return emUso;
  // "Alugadas" exclui reservas, como o KPI da homepage.
  if (status === 'alugadas') return emUso && estado !== 'em_reserva';
  // Inspeção ou seguro vencidos/a vencer; as inativas não circulam, ficam de fora.
  if (status === 'atencao') return estado !== 'inativo' && alertasDocumentos(v).length > 0;
  return estado === status;
}

/** Aplica os filtros; `ignorar` deixa uma faceta de fora (para contar as suas opções). */
export function filtrarViaturas<V extends ViaturaFiltravel>(
  viaturas: readonly V[],
  f: FiltrosViaturas,
  estadoDe: (v: V) => string,
  ignorar?: FacetaViaturas
): V[] {
  const termo = normalizeSearch(f.search);
  return viaturas.filter((v) => {
    // Sem a faceta de estado, as vendidas ficam: passaEstado decide por opção.
    if (ignorar !== 'status' && !passaEstado(v, f.status, estadoDe)) return false;
    if (
      termo &&
      ![v.matricula, v.marca, v.modelo, v.ocupante_nome].some((campo) =>
        normalizeSearch(campo).includes(termo)
      )
    )
      return false;
    if (
      ignorar !== 'categoria' &&
      f.categoria !== 'all' &&
      grupoCategoria(v.categoria) !== f.categoria
    )
      return false;
    if (
      ignorar !== 'combustivel' &&
      f.combustivel !== 'all' &&
      grupoCombustivel(v.combustivel) !== f.combustivel
    )
      return false;
    // Um tipo específico exclui slots; o filtro slot é uma categoria própria.
    if (f.tipo === 'slot') return !!v.is_slot;
    if (f.tipo !== 'all') return !v.is_slot && v.tipo_id === f.tipo;
    return true;
  });
}

function contarGrupos<V>(lista: readonly V[], grupo: (v: V) => string): Map<string, number> {
  const contas = new Map<string, number>();
  for (const v of lista) contas.set(grupo(v), (contas.get(grupo(v)) ?? 0) + 1);
  return contas;
}

/** Só aparecem opções com viaturas (mais a escolhida, para se poder ver e limpar). */
function opcoesDeGrupos(
  contas: Map<string, number>,
  conhecidos: Record<string, string>,
  escolhido: string,
  todos: string
): OpcaoFiltro[] {
  const ordem = [...Object.keys(conhecidos), SEM_INFO];
  const grupos = [...contas.keys()].sort((a, b) => {
    const ia = ordem.indexOf(a);
    const ib = ordem.indexOf(b);
    return (
      (ia < 0 ? ordem.length - 1 : ia) - (ib < 0 ? ordem.length - 1 : ib) || a.localeCompare(b)
    );
  });
  if (escolhido !== 'all' && !contas.has(escolhido)) grupos.push(escolhido);
  const total = [...contas.values()].reduce((s, n) => s + n, 0);
  return [
    { value: 'all', label: todos, count: total },
    ...grupos.map((g) => ({ value: g, label: rotulo(g, conhecidos), count: contas.get(g) ?? 0 })),
  ];
}

/** Opções de cada filtro com a contagem que dariam, dados os outros filtros escolhidos. */
export function opcoesFiltrosViaturas<V extends ViaturaFiltravel>(
  viaturas: readonly V[],
  f: FiltrosViaturas,
  estadoDe: (v: V) => string
): Record<FacetaViaturas, OpcaoFiltro[]> {
  const semEstado = filtrarViaturas(viaturas, f, estadoDe, 'status');
  const estados = ESTADOS.map((o) => ({
    ...o,
    count: semEstado.filter((v) => passaEstado(v, o.value, estadoDe)).length,
  })).filter((o) => o.count > 0 || o.value === 'all' || o.value === f.status);

  return {
    status: estados,
    combustivel: opcoesDeGrupos(
      contarGrupos(filtrarViaturas(viaturas, f, estadoDe, 'combustivel'), (v) =>
        grupoCombustivel(v.combustivel)
      ),
      COMBUSTIVEIS,
      f.combustivel,
      'Todos'
    ),
    categoria: opcoesDeGrupos(
      contarGrupos(filtrarViaturas(viaturas, f, estadoDe, 'categoria'), (v) =>
        grupoCategoria(v.categoria)
      ),
      CATEGORIAS,
      f.categoria,
      'Todas'
    ),
  };
}
