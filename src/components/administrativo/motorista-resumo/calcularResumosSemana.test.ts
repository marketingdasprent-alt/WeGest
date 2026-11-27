// A ficha do motorista (só as linhas dele, pela função no servidor) tem de dar
// a mesma linha que a lista de Contas/Resumo (a org inteira).
import { describe, it, expect } from 'vitest';
import { normalizeName } from '@/components/administrativo/motoristaNomeMatching';
import { calcularResumosSemana } from './calcularResumosSemana';
import { divisorCorte } from './retencaoIrs';
import type { DadosResumoSemana, MotoristaParaResumo } from './dadosResumoSemana';

const INI = new Date(2026, 10, 16);
const FIM = new Date(2026, 10, 22);

const ficha = (id: string, nome: string, extra: Partial<MotoristaParaResumo> = {}) =>
  ({
    id,
    nome,
    recibo_verde: true,
    retencao_irs: null,
    retencao_iva_pct: null,
    retencao_irs_pct: null,
    corte_sem_recibo_pct: null,
    uber_uuid: null,
    bolt_id: null,
    gestor_responsavel: null,
    data_contratacao: '2026-01-01',
    status_ativo: true,
    desativado_em: null,
    created_at: '2026-01-01T00:00:00Z',
    is_conta_frota: false,
    ...extra,
  }) satisfies MotoristaParaResumo;

const contrato = (motoristaId: string, preco: number) => ({
  viatura_id: `v-${motoristaId}`,
  data_inicio: '2026-11-01T10:00:00Z',
  data_fim: null,
  regime: 'tvde',
  preco_semana_acordado: preco,
  estado_operacional: 'em_curso',
  viaturas: { matricula: `AA-${motoristaId}`, modelo_id: null, grupo_id: null },
  contrato_condutores: [{ motorista_id: motoristaId }],
  cliente: null,
});

/** A org inteira, como a lista de Contas/Resumo a lê. */
const dadosDaOrg = (): DadosResumoSemana => ({
  motoristas: [
    ficha('x', 'Xavier Antunes Lopes', { uber_uuid: 'uber-x' }),
    ficha('y', 'Yara Bento Costa', { recibo_verde: false }),
  ],
  uberResumos: [
    {
      uber_driver_id: 'uber-x',
      motorista_nome: 'Xavier Lopes',
      motorista_id: null,
      ganhos_brutos: 300,
      gorjetas: 10,
      viagens: 30,
    },
    {
      uber_driver_id: 'uber-y',
      motorista_nome: 'Yara Costa',
      motorista_id: null,
      ganhos_brutos: 200,
      gorjetas: 5,
      viagens: 20,
    },
    // Conta ligada à Yara com o nome do Xavier: sem a ligação cairia nele.
    {
      uber_driver_id: 'uber-y2',
      motorista_nome: 'Xavier Antunes Lopes',
      motorista_id: null,
      ganhos_brutos: 40,
      gorjetas: 0,
      viagens: 4,
    },
    // Conta sem ficha de outra pessoa.
    {
      uber_driver_id: 'uber-z',
      motorista_nome: 'Zulmira Pires',
      motorista_id: null,
      ganhos_brutos: 70,
      gorjetas: 0,
      viagens: 7,
    },
    // Conta de frota: fica fora dos resumos.
    {
      uber_driver_id: 'uber-frota',
      motorista_nome: 'Xavier Antunes Lopes',
      motorista_id: null,
      ganhos_brutos: 999,
      gorjetas: 0,
      viagens: 1,
    },
  ],
  atividadeUber: [
    { uber_driver_id: 'uber-x', viagens_concluidas: 30 },
    { uber_driver_id: 'uber-y', viagens_concluidas: 20 },
  ],
  uberDrivers: [
    { uber_driver_id: 'uber-y', motorista_id: 'y', full_name: 'Yara Costa', is_conta_frota: false },
    { uber_driver_id: 'uber-y2', motorista_id: 'y', full_name: null, is_conta_frota: false },
    { uber_driver_id: 'uber-frota', motorista_id: null, full_name: 'Frota', is_conta_frota: true },
  ],
  combustivel: [
    { motorista_id: 'x', amount: 40.5 },
    { motorista_id: 'y', amount: 12 },
    { motorista_id: 'x', amount: 9.5 },
  ],
  portagens: [
    { motorista_id: 'x', amount: 1.75 },
    { motorista_id: 'y', amount: 3 },
  ],
  contratos: [contrato('x', 175), contrato('y', 150)],
  tarifas: [],
  tarifasModelo: [],
  financeiro: [
    { motorista_id: 'x', valor: 6.4, categoria: 'outros', tipo: 'debito' },
    { motorista_id: 'y', valor: 20, categoria: 'outros', tipo: 'debito' },
  ],
  boltResumos: [
    {
      motorista_id: 'x',
      motorista_nome: 'Xavier Lopes',
      liquido_a_pagar: 120,
      gorjetas: 2,
      viagens_terminadas: 12,
      identificador_motorista: null,
    },
    // Sem motorista: a conta emparelha-a pelo nome com o Xavier.
    {
      motorista_id: null,
      motorista_nome: 'Xavier Antunes Lopes',
      liquido_a_pagar: 30,
      gorjetas: 0,
      viagens_terminadas: 3,
      identificador_motorista: null,
    },
    {
      motorista_id: 'y',
      motorista_nome: 'Yara Costa',
      liquido_a_pagar: 80,
      gorjetas: 0,
      viagens_terminadas: 8,
      identificador_motorista: null,
    },
    // Sem ficha e sem nada de X ou Y: a função não a dá a nenhum dos dois.
    {
      motorista_id: null,
      motorista_nome: 'Zulmira Pires',
      liquido_a_pagar: 55,
      gorjetas: 0,
      viagens_terminadas: 5,
      identificador_motorista: null,
    },
  ],
});

/** nome_plataforma_pode_ser da migração 20261127120000, em JS. */
function nomePodeSer(plataforma: string | null, oficial: string) {
  const p = normalizeName(plataforma ?? '');
  const o = normalizeName(oficial);
  const ruido = ['', 'da', 'de', 'do', 'das', 'dos', 'e'];
  const palavrasO = o.split(' ');
  return (
    p !== '' &&
    o !== '' &&
    (o.includes(p) ||
      p.includes(o) ||
      p.split(' ').some((w) => !ruido.includes(w) && palavrasO.includes(w)))
  );
}

/** O que resumo_semana_motorista_ficha devolve para um motorista. */
function soDoMotorista(dados: DadosResumoSemana, id: string): DadosResumoSemana {
  const m = dados.motoristas.find((f) => f.id === id)!;
  const dele = <T extends { motorista_id: string | null }>(l: T[]) =>
    l.filter((r) => r.motorista_id === id);
  return {
    ...dados,
    boltResumos: dados.boltResumos.filter(
      (r) =>
        r.motorista_id === id ||
        (r.motorista_id === null &&
          ((!!m.bolt_id && r.identificador_motorista === m.bolt_id) ||
            nomePodeSer(r.motorista_nome, m.nome)))
    ),
    uberDrivers: dados.uberDrivers
      .filter(
        (u) =>
          u.is_conta_frota ||
          u.motorista_id === id ||
          u.uber_driver_id === m.uber_uuid ||
          nomePodeSer(u.full_name, m.nome) ||
          dados.uberResumos.some(
            (ur) => ur.uber_driver_id === u.uber_driver_id && nomePodeSer(ur.motorista_nome, m.nome)
          )
      )
      .map((u) => (u.is_conta_frota ? { ...u, motorista_id: null, full_name: null } : u)),
    combustivel: dele(dados.combustivel),
    portagens: dele(dados.portagens),
    contratos: dados.contratos
      .filter((c) =>
        (Array.isArray(c.contrato_condutores) ? c.contrato_condutores : []).some(
          (cc) => cc.motorista_id === id
        )
      )
      .map((c) => ({ ...c, contrato_condutores: [{ motorista_id: id }] })),
  };
}

const linhaDe = (dados: DadosResumoSemana, id: string) =>
  calcularResumosSemana(dados, INI, FIM).resumos.find((r) => r.motorista_id === id);

describe('calcularResumosSemana', () => {
  it('ficha e lista dão a mesma linha do motorista', () => {
    const org = dadosDaOrg();
    for (const id of ['x', 'y']) {
      const daLista = linhaDe(org, id);
      const daFicha = linhaDe(soDoMotorista(org, id), id);
      expect(daLista).toBeDefined();
      expect(daFicha).toEqual(daLista);
    }
  });

  it('soma Bolt (incluindo a linha emparelhada pelo nome), Uber e custos do motorista', () => {
    const x = linhaDe(dadosDaOrg(), 'x')!;
    expect(x.faturado_bolt).toBe(150);
    expect(x.faturado_uber).toBe(300);
    expect(x.gorjeta_bolt).toBe(2);
    expect(x.gorjeta_uber).toBe(10);
    expect(x.combustivel).toBe(50);
    expect(x.portagens).toBe(1.75);
    expect(x.outros_custos).toBe(6.4);
    expect(x.aluguer).toBe(175);
    // Recibo verde: sem corte. 150 + 300 − 50 − 1,75 − 175 − 6,40.
    expect(x.liquido).toBeCloseTo(216.85, 2);
  });

  it('a função dá à ficha o que pode ser dele, e nada que a lista dê a outro', () => {
    const doX = soDoMotorista(dadosDaOrg(), 'x');
    expect(doX.boltResumos.map((r) => r.motorista_nome)).toEqual([
      'Xavier Lopes',
      'Xavier Antunes Lopes',
    ]);
    // A conta da Yara com o nome do Xavier vai, para continuar na Yara.
    expect(doX.uberDrivers.map((u) => u.uber_driver_id).sort()).toEqual(['uber-frota', 'uber-y2']);
    expect(linhaDe(doX, 'x')!.faturado_uber).toBe(300);
    expect(linhaDe(dadosDaOrg(), 'y')!.faturado_uber).toBe(240);
  });

  it('sem recibo verde: o corte divide a base, mas não a gorjeta', () => {
    const y = linhaDe(dadosDaOrg(), 'y')!;
    const divisor = divisorCorte(false, false, y.corte_sem_recibo);
    expect(divisor).toBeGreaterThan(1);
    // Bolt 80 sem gorjeta; Uber 240 com 5 de gorjeta fora do corte.
    const receita = 80 / divisor + (240 - 5) / divisor + 5;
    expect(y.liquido).toBeCloseTo(receita - 12 - 3 - 150 - 20, 6);
  });

  it('retenção de IRS: líquido é o total a receber depois da retenção', () => {
    const dados = dadosDaOrg();
    dados.motoristas[0] = { ...dados.motoristas[0], retencao_irs: true, retencao_irs_pct: 25 };
    const x = linhaDe(dados, 'x')!;
    expect(x.retencao).not.toBeNull();
    expect(x.liquido).toBe(x.retencao!.totalAReceber);
    expect(x.liquido).not.toBeCloseTo(216.85, 2);
  });

  it('a conta de frota fica fora dos resumos', () => {
    const { resumos } = calcularResumosSemana(dadosDaOrg(), INI, FIM);
    expect(resumos.some((r) => r.faturado_uber === 999)).toBe(false);
    expect(linhaDe(dadosDaOrg(), 'x')!.faturado_uber).toBe(300);
  });

  it('sem linhas: sem resumos e mapas vazios', () => {
    const vazio: DadosResumoSemana = {
      motoristas: [],
      uberResumos: [],
      atividadeUber: [],
      uberDrivers: [],
      combustivel: [],
      portagens: [],
      contratos: [],
      tarifas: [],
      tarifasModelo: [],
      financeiro: [],
      boltResumos: [],
    };
    const r = calcularResumosSemana(vazio, INI, FIM);
    expect(r.resumos).toEqual([]);
    expect(r.motoristasList).toEqual([]);
    expect(r.aluguerEstimadoMap).toEqual({});
  });
});
