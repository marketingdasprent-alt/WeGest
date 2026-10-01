import { describe, it, expect } from 'vitest';

import {
  contaImportacaoDe,
  contasEmFalta,
  decidirConta,
  detectarPlataforma,
  ehSemanaCompleta,
  faltaParaImportar,
  identificadoresDoFicheiro,
  nomeFicheiroApontaPara,
  periodoDoNomeFicheiro,
  repetidosNoLote,
  semanasRecentes,
  type ContaImportacao,
} from './importacaoAutomatica';

const UBER_CSV =
  '"UUID do motorista","Nome próprio do motorista","Apelido do motorista","Pago a si"\n' +
  '"4a7232ad-5596-4978-925c-2c70ea348ac3","Agnelo","Tavares","244.99"\n' +
  '"1e66b4a4-0000-4000-8000-000000000001","Etinatan","Moura","966.62"\n';

const BOLT_CSV =
  'Motorista,Email,Identificador do motorista,"Ganhos brutos (total)|€"\n' +
  'Ana,ana@x.pt,abc123,"100,50"\nRui,rui@x.pt,def456,80\n';

const contas: ContaImportacao[] = [
  { id: 'acores', nome: 'Uber Açores', nomeEmpresa: null, plataforma: 'uber' },
  { id: 'urbango', nome: 'Uber Urbango', nomeEmpresa: null, plataforma: 'uber' },
  { id: 'decada', nome: 'Uber Década Ousada', nomeEmpresa: null, plataforma: 'uber' },
  { id: 'bolt', nome: 'Bolt Década', nomeEmpresa: null, plataforma: 'bolt' },
  { id: 'repsol', nome: 'Repsol', nomeEmpresa: null, plataforma: 'repsol' },
];

describe('detectarPlataforma', () => {
  it('reconhece cada fonte pelas colunas', () => {
    expect(detectarPlataforma(UBER_CSV)).toBe('uber');
    expect(detectarPlataforma(BOLT_CSV)).toBe('bolt');
    expect(
      detectarPlataforma('Data e Hora início;Cartão;Energia (kWh);Custo (€);Carregador\n')
    ).toBe('edp');
    expect(
      detectarPlataforma('Dia Hora,Nº cartão,Km,Posto,Valor total fornecido (preço do posto)\n')
    ).toBe('bp');
    expect(detectarPlataforma('CONTA REPSOL;NÚM. CARTÃO;DATA OPERAÇÃO;VALOR\n')).toBe('repsol');
    expect(detectarPlataforma('Matrícula;Data Saída;Barreira Saída;Operador;Valor\n')).toBe(
      'viaverde'
    );
  });

  it('o cabeçalho pode vir depois de linhas de capa', () => {
    expect(detectarPlataforma('Relatório\nEmpresa X\n\nCONTA REPSOL;NÚM. CARTÃO\n')).toBe('repsol');
  });

  it('o ficheiro de actividade da Uber (sem "Pago a si") não é o de pagamentos', () => {
    expect(detectarPlataforma('UUID do motorista;Viagens concluídas\n')).toBeNull();
  });
});

describe('periodoDoNomeFicheiro', () => {
  it('lê a semana do nome', () => {
    expect(periodoDoNomeFicheiro('20260921-20260927-UBER AÇORES.csv')).toEqual({
      inicio: '2026-09-21',
      fim: '2026-09-27',
    });
  });

  it('de segunda a segunda conta até domingo (o ficheiro da Premium Ride)', () => {
    expect(periodoDoNomeFicheiro('20260921-20260928-payments_driver-REMIUM_RIDE_LDA.csv')).toEqual({
      inicio: '2026-09-21',
      fim: '2026-09-27',
    });
  });

  it('datas impossíveis ou sem período dão nulo', () => {
    expect(periodoDoNomeFicheiro('20261340-20261346-x.csv')).toBeNull();
    expect(periodoDoNomeFicheiro('UBER AÇORES.csv')).toBeNull();
    expect(periodoDoNomeFicheiro('20260927-20260921-x.csv')).toBeNull();
  });

  it('semana completa é de segunda a domingo', () => {
    expect(ehSemanaCompleta({ inicio: '2026-09-21', fim: '2026-09-27' })).toBe(true);
    expect(ehSemanaCompleta({ inicio: '2026-09-22', fim: '2026-09-28' })).toBe(false);
  });
});

describe('identificadoresDoFicheiro', () => {
  it('Uber: os UUID dos motoristas', () => {
    expect(identificadoresDoFicheiro('uber', UBER_CSV)).toEqual([
      '4a7232ad-5596-4978-925c-2c70ea348ac3',
      '1e66b4a4-0000-4000-8000-000000000001',
    ]);
  });

  it('Bolt: a coluna "Identificador do motorista", mesmo com aspas e vírgulas', () => {
    expect(identificadoresDoFicheiro('bolt', BOLT_CSV)).toEqual(['abc123', 'def456']);
  });
});

describe('nomeFicheiroApontaPara', () => {
  it('reconhece os nomes que a BO usa', () => {
    expect(nomeFicheiroApontaPara('20260921-20260927-UBER AÇORES.csv', contas[0])).toBe(true);
    expect(nomeFicheiroApontaPara('20260907-20260913-UBER URBAN.csv', contas[1])).toBe(true);
    expect(nomeFicheiroApontaPara('20260921-20260927-UBER DECADA.csv', contas[2])).toBe(true);
    expect(nomeFicheiroApontaPara('20260921-20260927-UBER URBANGO.csv', contas[0])).toBe(false);
  });

  it('usa também o nome da empresa da conta', () => {
    const lara = {
      id: 'l',
      nome: 'Uber Lara',
      nomeEmpresa: 'PREMIUM RIDE, LDA',
      plataforma: 'uber' as const,
    };
    expect(nomeFicheiroApontaPara('20260914-20260920-PREMIUMRIDE UBER 21.09.csv', lara)).toBe(true);
    expect(nomeFicheiroApontaPara('payments_driver-REMIUM_RIDE_LDA.csv', lara)).toBe(true);
  });
});

describe('decidirConta', () => {
  const base = { plataforma: 'uber' as const, contas, totalIdentificadores: 18 };

  it('o caso de 28/09: ficheiro da Urbango com o nome da Urbango vai para a Urbango', () => {
    const d = decidirConta({
      ...base,
      nomeFicheiro: '20260921-20260927-UBER URBANGO.csv',
      sobreposicao: {
        urbango: { linhas: 140, motoristas: 18 },
        acores: { linhas: 0, motoristas: 0 },
      },
    });
    expect(d).toMatchObject({ contaId: 'urbango', estado: 'ok' });
  });

  it('nome e conteúdo discordam: não adivinha, pára e explica', () => {
    const d = decidirConta({
      ...base,
      nomeFicheiro: '20260921-20260927-UBER AÇORES.csv',
      sobreposicao: { urbango: { linhas: 140, motoristas: 18 } },
    });
    expect(d.estado).toBe('conflito');
    expect(d.contaId).toBeNull();
    expect(d.motivo).toContain('Uber Urbango');
  });

  it('uma importação errada antiga não engana: a conta com mais semanas ganha', () => {
    const d = decidirConta({
      ...base,
      nomeFicheiro: 'pagamentos.csv',
      sobreposicao: {
        urbango: { linhas: 140, motoristas: 18 },
        acores: { linhas: 18, motoristas: 18 },
      },
    });
    expect(d).toMatchObject({ contaId: 'urbango', estado: 'ok' });
  });

  it('motoristas repartidos por contas: pede a escolha', () => {
    const d = decidirConta({
      ...base,
      nomeFicheiro: 'x.csv',
      sobreposicao: {
        urbango: { linhas: 50, motoristas: 9 },
        acores: { linhas: 40, motoristas: 9 },
      },
    });
    expect(d.estado).toBe('escolher');
  });

  it('conta nova, sem histórico: vale o nome do ficheiro', () => {
    const d = decidirConta({
      ...base,
      nomeFicheiro: '20260921-20260927-UBER AÇORES.csv',
      sobreposicao: {},
    });
    expect(d).toMatchObject({ contaId: 'acores', estado: 'ok' });
  });

  it('combustível: a única conta da plataforma', () => {
    const d = decidirConta({
      plataforma: 'repsol',
      contas,
      nomeFicheiro: 'movimentos.xlsx',
      totalIdentificadores: 0,
      sobreposicao: {},
    });
    expect(d).toMatchObject({ contaId: 'repsol', estado: 'ok' });
  });

  it('sem conta activa da plataforma', () => {
    const d = decidirConta({
      plataforma: 'edp',
      contas,
      nomeFicheiro: 'x',
      totalIdentificadores: 0,
      sobreposicao: {},
    });
    expect(d.estado).toBe('desconhecido');
  });
});

describe('contasEmFalta', () => {
  it('a Uber Açores que nunca entrou em 28/09 aparece em falta', () => {
    const falta = contasEmFalta(contas, new Set(['urbango', 'decada']), new Set(['bolt']));
    expect(falta.map((c) => c.id)).toEqual(['acores']);
  });

  it('combustíveis não contam: trazem a data em cada linha', () => {
    expect(
      contasEmFalta(contas, new Set(['acores', 'urbango', 'decada']), new Set(['bolt']))
    ).toEqual([]);
  });
});

describe('contaImportacaoDe', () => {
  it('as contas do robô contam pela plataforma-alvo; Via Verde normaliza', () => {
    const r = {
      id: '1',
      nome: 'Uber Açores',
      company_name: null,
      plataforma: 'robot',
      robot_target_platform: 'uber',
    };
    expect(contaImportacaoDe(r)).toMatchObject({ plataforma: 'uber' });
    expect(
      contaImportacaoDe({ ...r, plataforma: 'via_verde', robot_target_platform: null })
    ).toMatchObject({
      plataforma: 'viaverde',
    });
    expect(
      contaImportacaoDe({ ...r, plataforma: 'faturacao', robot_target_platform: null })
    ).toBeNull();
  });
});

describe('semanasRecentes', () => {
  it('a 01/10/2026 a última semana completa é 21 a 27/09', () => {
    expect(semanasRecentes(new Date(2026, 9, 1), 2)).toEqual([
      { inicio: '2026-09-21', fim: '2026-09-27' },
      { inicio: '2026-09-14', fim: '2026-09-20' },
    ]);
  });
});

describe('faltaParaImportar', () => {
  const semana = { inicio: '2026-09-21', fim: '2026-09-27' };
  it('diz o que falta, por ordem', () => {
    expect(faltaParaImportar({ plataforma: null, contaId: null, periodo: null })).toBe(
      'Ficheiro não reconhecido.'
    );
    expect(faltaParaImportar({ plataforma: 'uber', contaId: null, periodo: semana })).toBe(
      'Escolha a conta.'
    );
    expect(faltaParaImportar({ plataforma: 'uber', contaId: 'a', periodo: null })).toBe(
      'Escolha a semana.'
    );
    expect(faltaParaImportar({ plataforma: 'uber', contaId: 'a', periodo: semana })).toBeNull();
  });

  it('combustível não precisa de semana', () => {
    expect(faltaParaImportar({ plataforma: 'bp', contaId: 'a', periodo: null })).toBeNull();
  });
});

describe('repetidosNoLote', () => {
  const semana = { inicio: '2026-09-21', fim: '2026-09-27' };
  it('dois ficheiros para a mesma conta e semana ficam marcados', () => {
    const r = repetidosNoLote([
      { chave: 'a', plataforma: 'uber', contaId: 'urbango', periodo: semana },
      { chave: 'b', plataforma: 'uber', contaId: 'urbango', periodo: semana },
      { chave: 'c', plataforma: 'uber', contaId: 'acores', periodo: semana },
    ]);
    expect([...r].sort()).toEqual(['a', 'b']);
  });

  it('combustível pode vir em vários ficheiros (cada abastecimento tem chave própria)', () => {
    const r = repetidosNoLote([
      { chave: 'a', plataforma: 'bp', contaId: 'bp', periodo: null },
      { chave: 'b', plataforma: 'bp', contaId: 'bp', periodo: null },
    ]);
    expect(r.size).toBe(0);
  });
});
