/** Abastecimento imputado a um motorista, com o que se sabe do carro abastecido. */
export interface TransacaoCombustivel {
  id: string;
  /** Hora local da bomba (a importação grava-a como UTC — só se usa a data). */
  data: string;
  valor: number;
  motoristaId: string | null;
  /** O que o motorista escreveu na bomba ("MATRÍCULA/CONDUTOR TICKET"). */
  matriculaBomba: string | null;
  viaturaId: string | null;
}

export interface ViaturaMatricula {
  id: string;
  matricula: string;
}

export interface AssociacaoViatura {
  viaturaId: string;
  motoristaId: string;
  inicio: string | null;
  fim: string | null;
}

export interface AbastecimentoSuspeito {
  id: string;
  data: string;
  valor: number;
  imputadoId: string;
  matricula: string;
  titularesIds: string[];
}

const chave = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A matrícula escrita na bomba, se parecer uma matrícula (muitos escrevem "0" ou "1"). */
export function matriculaDaBomba(texto: string | null | undefined): string | null {
  const k = chave(texto);
  return /^[A-Z0-9]{6}$/.test(k) ? k : null;
}

const cobre = (a: AssociacaoViatura, dia: string) =>
  (a.inicio ?? '0000-00-00') <= dia && (!a.fim || a.fim >= dia);

/**
 * Abastecimentos em que o carro abastecido estava, nesse dia, com outro
 * motorista. Um dos dois registos está errado — o cartão ou a associação do
 * carro — e convém ver antes de fechar a semana. Sem matrícula reconhecível,
 * ou com o carro sem ninguém associado, não há prova: fica de fora.
 */
export function abastecimentosSuspeitos(
  transacoes: readonly TransacaoCombustivel[],
  viaturas: readonly ViaturaMatricula[],
  associacoes: readonly AssociacaoViatura[]
): AbastecimentoSuspeito[] {
  const porMatricula = new Map(viaturas.map((v) => [chave(v.matricula), v]));
  const porId = new Map(viaturas.map((v) => [v.id, v]));
  const doCarro = new Map<string, AssociacaoViatura[]>();
  for (const a of associacoes) {
    const lista = doCarro.get(a.viaturaId) ?? [];
    lista.push(a);
    doCarro.set(a.viaturaId, lista);
  }

  const suspeitos: AbastecimentoSuspeito[] = [];
  for (const t of transacoes) {
    if (!t.motoristaId) continue;
    const placa = matriculaDaBomba(t.matriculaBomba);
    const viatura = (placa && porMatricula.get(placa)) || (t.viaturaId && porId.get(t.viaturaId));
    if (!viatura) continue;
    const dia = t.data.slice(0, 10);
    const titulares = [
      ...new Set(
        (doCarro.get(viatura.id) ?? []).filter((a) => cobre(a, dia)).map((a) => a.motoristaId)
      ),
    ];
    if (titulares.length === 0 || titulares.includes(t.motoristaId)) continue;
    suspeitos.push({
      id: t.id,
      data: t.data,
      valor: t.valor,
      imputadoId: t.motoristaId,
      matricula: viatura.matricula,
      titularesIds: titulares,
    });
  }
  return suspeitos.sort((a, b) => a.data.localeCompare(b.data));
}
