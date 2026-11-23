import type { PedidoTrocaKms, TipoPedidoAlteracao } from '@/hooks/usePedidosTrocaKms';

export type OrdenacaoPedidos = 'contrato_desc' | 'contrato_asc' | 'data_desc' | 'data_asc';

export interface FiltrosPedidos {
  pesquisa: string;
  ordenacao: OrdenacaoPedidos;
  tipo: TipoPedidoAlteracao | 'todos';
  estado: 'todos' | 'aceite' | 'recusado';
}

export type PedidoFiltravel = Pick<
  PedidoTrocaKms,
  'id' | 'contrato_codigo' | 'tipo' | 'estado' | 'motivo' | 'created_at' | 'respondido_em'
>;

export const FILTROS_PEDIDOS_INICIAIS: FiltrosPedidos = {
  pesquisa: '',
  ordenacao: 'contrato_desc',
  tipo: 'todos',
  estado: 'todos',
};

const semAcentos = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// A data do histórico é a da resposta; sem ela, a do pedido. Inválida vale NaN.
const dataDe = (p: PedidoFiltravel) => new Date(p.respondido_em ?? p.created_at).getTime();

// Datas inválidas vão sempre para o fim; o sort nativo é estável.
function compararData(a: PedidoFiltravel, b: PedidoFiltravel, desc: boolean): number {
  const da = dataDe(a);
  const db = dataDe(b);
  if (Number.isNaN(da)) return Number.isNaN(db) ? 0 : 1;
  if (Number.isNaN(db)) return -1;
  return desc ? db - da : da - db;
}

function comparar(a: PedidoFiltravel, b: PedidoFiltravel, ordem: OrdenacaoPedidos): number {
  if (ordem === 'data_desc') return compararData(a, b, true);
  if (ordem === 'data_asc') return compararData(a, b, false);
  // Sem código vai sempre para o fim, em qualquer sentido.
  if (a.contrato_codigo == null) return b.contrato_codigo == null ? 0 : 1;
  if (b.contrato_codigo == null) return -1;
  return ordem === 'contrato_asc'
    ? a.contrato_codigo - b.contrato_codigo
    : b.contrato_codigo - a.contrato_codigo;
}

export function filtrarPedidos<T extends PedidoFiltravel>(
  pedidos: T[],
  filtros: FiltrosPedidos
): T[] {
  const termo = semAcentos(filtros.pesquisa.trim().replace(/^#/, ''));
  return pedidos
    .filter((p) => filtros.tipo === 'todos' || p.tipo === filtros.tipo)
    .filter((p) => filtros.estado === 'todos' || p.estado === filtros.estado)
    .filter(
      (p) =>
        termo === '' ||
        String(p.contrato_codigo ?? '').includes(termo) ||
        semAcentos(p.motivo ?? '').includes(termo)
    )
    .sort((a, b) => comparar(a, b, filtros.ordenacao));
}
