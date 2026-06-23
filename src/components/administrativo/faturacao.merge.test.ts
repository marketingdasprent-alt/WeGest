import { describe, it, expect } from 'vitest';
import {
  mergeMovimentosToRows,
  mapMovimentoToRow,
  type MovimentoRaw,
  type FaturacaoRow,
} from './faturacao';

// ── Implementação de REFERÊNCIA (cópia fiel da versão O(n²) original) ──
// O teste compara a função real contra esta referência sobre input que
// exercita todos os ramos. Se o refactor for equivalente, deep-equal passa.
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const isFaturaReciboDesc = (desc: string | null | undefined): boolean => {
  if (!desc) return false;
  const d = desc.toLowerCase();
  return d.startsWith('factura-recibo') || d.startsWith('fatura-recibo');
};

function mergeReference(
  raw: MovimentoRaw[],
  estacoesMap: Record<string, string>,
  profilesMap: Record<string, string>
): FaturacaoRow[] {
  const reciboCreditos = raw
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.origem === 'recibo' && m.tipo === 'credito');
  const usados = new Set<number>();
  const rows: FaturacaoRow[] = [];

  raw.forEach((m) => {
    if (m.origem === 'recibo' && m.tipo === 'credito') return;
    const base = mapMovimentoToRow(m, estacoesMap, profilesMap);
    if (m.origem === 'cobranca' && m.tipo === 'debito' && isFaturaReciboDesc(m.descricao)) {
      const valor = round2(m.valor);
      let par = reciboCreditos.find(
        ({ m: r, i }) => !usados.has(i) && !!m.cobranca_id && r.recibo?.referencia === m.cobranca_id
      );
      if (!par) {
        par = reciboCreditos.find(
          ({ m: r, i }) =>
            !usados.has(i) && r.contrato_id === m.contrato_id && round2(r.valor) === valor
        );
      }
      if (par) {
        usados.add(par.i);
        const recRow = mapMovimentoToRow(par.m, estacoesMap, profilesMap);
        rows.push({
          ...base,
          docTipo: 'fatura_recibo',
          credito: recRow.credito,
          debito: null,
          metodoRaw: recRow.metodoRaw,
          metodoLabel: recRow.metodoLabel,
          numeroDoc: base.numeroDoc !== '—' ? base.numeroDoc : recRow.numeroDoc,
          referencia: recRow.referencia,
        });
        return;
      }
    }
    rows.push(base);
  });

  reciboCreditos.forEach(({ m, i }) => {
    if (usados.has(i)) return;
    rows.push(mapMovimentoToRow(m, estacoesMap, profilesMap));
  });

  rows.sort((a, b) => {
    const da = a.dataMovimento ?? '';
    const db = b.dataMovimento ?? '';
    if (da !== db) return da < db ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return rows;
}

// ── Helper para construir MovimentoRaw com defaults ──
let seq = 0;
function mk(partial: Partial<MovimentoRaw>): MovimentoRaw {
  seq += 1;
  return {
    id: `m${seq}`,
    data_movimento: '2026-06-01',
    created_at: `2026-06-01T00:00:${String(seq).padStart(2, '0')}Z`,
    tipo: 'debito',
    valor: 100,
    origem: 'cobranca',
    descricao: null,
    primavera_ref: null,
    sincronizado_primavera: null,
    contrato_id: null,
    cobranca_id: null,
    recibo_id: null,
    nota_credito_id: null,
    entidade_id: 'e1',
    created_by: null,
    entidade: null,
    cobranca: null,
    recibo: null,
    contrato: null,
    ...partial,
  };
}

const EST: Record<string, string> = { st1: 'Leiria' };
const PROF: Record<string, string> = { u1: 'João' };

describe('mergeMovimentosToRows — equivalência com a referência O(n²)', () => {
  it('cobre todos os ramos: match por ref, fallback contrato+valor, avulso, normal, desempate', () => {
    const raw: MovimentoRaw[] = [
      // 1. Fatura normal (não fatura-recibo) → fica 'fatura'
      mk({ id: 'fat', origem: 'cobranca', tipo: 'debito', descricao: 'Fatura mensal', valor: 200 }),

      // 2. Fatura-Recibo emparelhada por referência (cobranca_id === recibo.referencia)
      mk({
        id: 'frRef',
        origem: 'cobranca',
        tipo: 'debito',
        descricao: 'Fatura-Recibo serviço',
        cobranca_id: 'C1',
        contrato_id: 'K1',
        valor: 100,
      }),
      mk({
        id: 'recRef',
        origem: 'recibo',
        tipo: 'credito',
        valor: 100,
        recibo: {
          id: 'r1',
          codigo: 1,
          metodo: 'mbway',
          documento_externo_ref: 'RX-1',
          referencia: 'C1',
          data_recibo: '2026-06-01',
        },
      }),

      // 3. Fatura-Recibo emparelhada por fallback (contrato + valor; sem referência)
      mk({
        id: 'frFb',
        origem: 'cobranca',
        tipo: 'debito',
        descricao: 'factura-recibo antiga',
        cobranca_id: 'C2',
        contrato_id: 'K2',
        valor: 50,
      }),
      mk({
        id: 'recFb',
        origem: 'recibo',
        tipo: 'credito',
        contrato_id: 'K2',
        valor: 50,
        recibo: {
          id: 'r2',
          codigo: 2,
          metodo: 'numerario',
          documento_externo_ref: null,
          referencia: null,
          data_recibo: '2026-06-01',
        },
      }),

      // 4. Desempate: duas FR para o mesmo contrato+valor → cada uma apanha o
      //    primeiro recibo não-usado (ordem de reciboCreditos).
      mk({
        id: 'frTie1',
        origem: 'cobranca',
        tipo: 'debito',
        descricao: 'Fatura-Recibo A',
        contrato_id: 'K3',
        valor: 30,
      }),
      mk({
        id: 'frTie2',
        origem: 'cobranca',
        tipo: 'debito',
        descricao: 'Fatura-Recibo B',
        contrato_id: 'K3',
        valor: 30,
      }),
      mk({ id: 'recTieA', origem: 'recibo', tipo: 'credito', contrato_id: 'K3', valor: 30 }),
      mk({ id: 'recTieB', origem: 'recibo', tipo: 'credito', contrato_id: 'K3', valor: 30 }),

      // 5. Recibo avulso (não casa com nenhuma FR) → vai para o fim
      mk({ id: 'recAvulso', origem: 'recibo', tipo: 'credito', contrato_id: 'K9', valor: 999 }),

      // 6. Movimentos variados (datas diferentes p/ testar ordenação)
      mk({
        id: 'nc',
        origem: 'nota_credito',
        tipo: 'credito',
        valor: 20,
        data_movimento: '2026-06-03',
      }),
      mk({ id: 'dano', origem: 'dano', tipo: 'debito', valor: 15, data_movimento: '2026-06-02' }),
    ];

    const got = mergeMovimentosToRows(raw, EST, PROF);
    const ref = mergeReference(raw, EST, PROF);
    expect(got).toEqual(ref);
  });

  it('lista vazia e lista só com recibos avulsos', () => {
    expect(mergeMovimentosToRows([], EST, PROF)).toEqual(mergeReference([], EST, PROF));

    const soRecibos: MovimentoRaw[] = [
      mk({ id: 'a', origem: 'recibo', tipo: 'credito', valor: 10 }),
      mk({ id: 'b', origem: 'recibo', tipo: 'credito', valor: 20 }),
    ];
    expect(mergeMovimentosToRows(soRecibos, EST, PROF)).toEqual(
      mergeReference(soRecibos, EST, PROF)
    );
  });
});
