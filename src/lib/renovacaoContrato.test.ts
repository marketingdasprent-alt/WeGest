import { describe, it, expect } from 'vitest';
import {
  calcularDataFimLongaDuracao,
  contratoRenovavel,
  contratosPorRenovar,
  estadoRenovacaoContrato,
  prazoRenovacao,
  proximaDataRenovacao,
  contratosExpiradosSemRenovacao,
  contratosTerminamHoje,
  type ContratoRenovavelInput,
} from './renovacaoContrato';

const base: ContratoRenovavelInput = {
  regime: 'rent_a_car',
  is_longa_duracao: true,
  substituido_em: null,
  estado_operacional: 'em_curso',
  data_inicio: '2026-06-13T10:00:00Z',
  data_fim: '2026-07-13T10:00:00Z',
  renovacao_opcao: 'intervalo_dias',
  renovacao_intervalo_dias: 30,
  deleted_at: null,
};

const iso = (s: string) => `${s}T10:00:00Z`;

describe('proximaDataRenovacao', () => {
  it('intervalo_dias soma N dias', () => {
    expect(proximaDataRenovacao(iso('2026-01-15'), 'intervalo_dias', 30).getUTCDate()).toBe(14);
    expect(proximaDataRenovacao(iso('2026-01-15'), 'intervalo_dias', 30).getUTCMonth()).toBe(1); // Fev
  });

  it('sem opção usa 30 dias por defeito', () => {
    const d = proximaDataRenovacao(iso('2026-01-15'), null, null);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(14);
  });

  it('mesmo_dia_cada_mes soma 1 mês mantendo o dia', () => {
    const d = proximaDataRenovacao('2026-01-15T10:00', 'mesmo_dia_cada_mes', null);
    expect(d.getMonth()).toBe(1); // Fev
    expect(d.getDate()).toBe(15);
  });

  it('primeiro_dia_mes dá o 1.º dia do mês seguinte', () => {
    const d = proximaDataRenovacao('2026-01-15T10:00', 'primeiro_dia_mes', null);
    expect(d.getMonth()).toBe(1); // Fev
    expect(d.getDate()).toBe(1);
  });
});

describe('calcularDataFimLongaDuracao', () => {
  it('devolve null quando não é longa duração', () => {
    expect(calcularDataFimLongaDuracao(iso('2026-07-15'), false, 'intervalo_dias', 30)).toBeNull();
  });

  it('devolve null quando is_longa_duracao é null/undefined', () => {
    expect(calcularDataFimLongaDuracao(iso('2026-07-15'), null, 'intervalo_dias', 30)).toBeNull();
    expect(calcularDataFimLongaDuracao(iso('2026-07-15'), undefined, null, null)).toBeNull();
  });

  it('longa duração com intervalo_dias soma os dias à data início', () => {
    const d = calcularDataFimLongaDuracao(iso('2026-07-15'), true, 'intervalo_dias', 30);
    expect(d).not.toBeNull();
    expect(d?.getUTCMonth()).toBe(7); // Agosto
    expect(d?.getUTCDate()).toBe(14);
  });

  it('longa duração com mesmo_dia_cada_mes soma 1 mês mantendo o dia', () => {
    const d = calcularDataFimLongaDuracao('2026-07-15T10:00', true, 'mesmo_dia_cada_mes', null);
    expect(d).not.toBeNull();
    expect(d?.getMonth()).toBe(7); // Agosto
    expect(d?.getDate()).toBe(15);
  });
});

describe('contratoRenovavel', () => {
  it('aceita rent-a-car longa duração activo e actual', () => {
    expect(contratoRenovavel(base)).toBe(true);
  });
  it('aceita TVDE longa duração com data_fim (igual a rent-a-car)', () => {
    expect(contratoRenovavel({ ...base, regime: 'tvde' })).toBe(true);
  });
  it('aceita TVDE SEM data_fim (em aberto — a 1.ª renovação arranca o ciclo)', () => {
    expect(contratoRenovavel({ ...base, regime: 'tvde', data_fim: null })).toBe(true);
  });
  it('rejeita slot', () => {
    expect(contratoRenovavel({ ...base, regime: 'slot' })).toBe(false);
  });
  it('rejeita curta duração', () => {
    expect(contratoRenovavel({ ...base, is_longa_duracao: false })).toBe(false);
  });
  it('rejeita versão já substituída', () => {
    expect(contratoRenovavel({ ...base, substituido_em: '2026-07-01T00:00:00Z' })).toBe(false);
  });
  it('rejeita contrato devolvido/fechado', () => {
    expect(contratoRenovavel({ ...base, estado_operacional: 'devolvido' })).toBe(false);
  });
  it('rejeita contrato apenas agendado (tem de estar em curso para renovar)', () => {
    expect(contratoRenovavel({ ...base, estado_operacional: 'agendado' })).toBe(false);
  });
  it('rejeita rent-a-car sem data_fim', () => {
    expect(contratoRenovavel({ ...base, data_fim: null })).toBe(false);
  });
});

describe('estadoRenovacaoContrato', () => {
  const hoje = new Date('2026-07-13T15:00:00');

  it('marca "hoje" quando data_fim é hoje', () => {
    expect(estadoRenovacaoContrato({ ...base, data_fim: '2026-07-13T08:00:00' }, hoje)).toBe(
      'hoje'
    );
  });
  it('marca "atraso" quando data_fim já passou', () => {
    expect(estadoRenovacaoContrato({ ...base, data_fim: '2026-07-10T08:00:00' }, hoje)).toBe(
      'atraso'
    );
  });
  it('devolve null quando a renovação ainda não chegou', () => {
    expect(estadoRenovacaoContrato({ ...base, data_fim: '2026-07-20T08:00:00' }, hoje)).toBeNull();
  });
  it('devolve null para contratos não renováveis (curta duração)', () => {
    expect(
      estadoRenovacaoContrato(
        { ...base, is_longa_duracao: false, data_fim: '2026-07-10T08:00:00' },
        hoje
      )
    ).toBeNull();
  });
  it('devolve null para contratos não renováveis (slot)', () => {
    expect(
      estadoRenovacaoContrato({ ...base, regime: 'slot', data_fim: '2026-07-10T08:00:00' }, hoje)
    ).toBeNull();
  });
  it('TVDE com data_fim comporta-se exactamente como rent-a-car', () => {
    expect(
      estadoRenovacaoContrato({ ...base, regime: 'tvde', data_fim: '2026-07-10T08:00:00' }, hoje)
    ).toBe('atraso');
    expect(
      estadoRenovacaoContrato({ ...base, regime: 'tvde', data_fim: '2026-07-13T08:00:00' }, hoje)
    ).toBe('hoje');
  });
  it('TVDE sem data_fim usa prazo virtual = início + 30 dias (regra: todo TVDE renova a 30d)', () => {
    // Começou há mais de 30 dias → em atraso.
    expect(
      estadoRenovacaoContrato(
        { ...base, regime: 'tvde', data_fim: null, data_inicio: '2026-05-01T10:00:00Z' },
        hoje
      )
    ).toBe('atraso');
    // Começou há menos de 30 dias → ainda no prazo.
    expect(
      estadoRenovacaoContrato(
        { ...base, regime: 'tvde', data_fim: null, data_inicio: '2026-07-01T10:00:00Z' },
        hoje
      )
    ).toBeNull();
  });
  it('rent-a-car sem data_fim continua sem prazo (não é 30d automático)', () => {
    expect(
      estadoRenovacaoContrato(
        { ...base, regime: 'rent_a_car', data_fim: null, data_inicio: '2026-05-01T10:00:00Z' },
        hoje
      )
    ).toBeNull();
  });
});

describe('prazoRenovacao', () => {
  it('usa a data_fim quando existe', () => {
    expect(prazoRenovacao(base)?.toISOString()).toBe(new Date(base.data_fim!).toISOString());
  });
  it('TVDE sem data_fim: data_início + ciclo (30d)', () => {
    const prazo = prazoRenovacao({
      ...base,
      regime: 'tvde',
      data_fim: null,
      data_inicio: '2026-06-01T10:00:00Z',
      renovacao_opcao: 'intervalo_dias',
      renovacao_intervalo_dias: 30,
    });
    expect(prazo?.getUTCMonth()).toBe(6); // Julho
    expect(prazo?.getUTCDate()).toBe(1);
  });
  it('rent-a-car sem data_fim não tem prazo', () => {
    expect(prazoRenovacao({ ...base, data_fim: null })).toBeNull();
  });
});

describe('contratosPorRenovar', () => {
  const hoje = new Date('2026-07-13T12:00:00');
  it('inclui hoje + atraso, com atraso primeiro e por prazo ascendente', () => {
    const contratos = [
      { ...base, id: 'hoje', data_fim: '2026-07-13T08:00:00' },
      { ...base, id: 'atraso-novo', data_fim: '2026-07-12T08:00:00' },
      { ...base, id: 'atraso-antigo', data_fim: '2026-07-01T08:00:00' },
      { ...base, id: 'futuro', data_fim: '2026-08-01T08:00:00' },
      // TVDE sem data_fim: prazo virtual 15/05 + 30d = 14/06 → o mais atrasado.
      {
        ...base,
        id: 'tvde-aberto',
        regime: 'tvde' as const,
        data_fim: null,
        data_inicio: '2026-05-15T08:00:00',
      },
    ];
    const r = contratosPorRenovar(contratos, hoje);
    expect(r.map((x) => (x.contrato as any).id)).toEqual([
      'tvde-aberto',
      'atraso-antigo',
      'atraso-novo',
      'hoje',
    ]);
    expect(r.every((x) => x.estado)).toBe(true);
  });
});

// ─── Contratos expirados que nenhum aviso apanhava ──────────────────────────

describe('contratosExpiradosSemRenovacao', () => {
  // Os dois rent-a-car de período fixo que ninguém via: o banner de renovações
  // exige is_longa_duracao, por isso caíam fora de todos os avisos.
  const curto: ContratoRenovavelInput = {
    ...base,
    is_longa_duracao: false,
    data_inicio: iso('2026-07-11'),
    data_fim: iso('2026-08-10'),
  };

  it('apanha o rent-a-car expirado que o banner de renovações ignora', () => {
    expect(contratoRenovavel(curto)).toBe(false); // sentinela: é por isto que passava despercebido
    const r = contratosExpiradosSemRenovacao([curto], new Date(iso('2026-09-07')));
    expect(r).toHaveLength(1);
  });

  it('não apanha contratos ainda dentro do prazo', () => {
    expect(contratosExpiradosSemRenovacao([curto], new Date(iso('2026-08-01')))).toHaveLength(0);
  });

  it('não duplica o que já está no banner de renovações', () => {
    // `base` é de longa duração: pertence a contratosPorRenovar, não aqui.
    expect(contratosExpiradosSemRenovacao([base], new Date(iso('2026-09-07')))).toHaveLength(0);
  });

  it('ignora versões substituídas e contratos que não estão em curso', () => {
    const hoje = new Date(iso('2026-09-07'));
    expect(
      contratosExpiradosSemRenovacao([{ ...curto, substituido_em: iso('2026-08-20') }], hoje)
    ).toHaveLength(0);
    expect(
      contratosExpiradosSemRenovacao([{ ...curto, estado_operacional: 'fechado' }], hoje)
    ).toHaveLength(0);
  });
});

// O botão "Terminam hoje" da lista de contratos. Ao contrário de
// contratosPorRenovar, NÃO filtra por renovável: entra tudo o que acaba no
// dia — longa e curta duração, TVDE e rent-a-car. O que fica de fora é o que
// já não tem nada a fazer: fechado, cancelado, devolvido, substituído, apagado.
describe('contratosTerminamHoje', () => {
  const hoje = new Date('2026-09-11T14:30:00');
  const termina = (data_fim: string | null, extra: Partial<ContratoRenovavelInput> = {}) => ({
    ...base,
    data_fim,
    ...extra,
  });

  it('entra o que termina hoje, a qualquer hora do dia', () => {
    const madrugada = termina('2026-09-11T00:05:00');
    const noite = termina('2026-09-11T23:50:00');
    expect(contratosTerminamHoje([madrugada, noite], hoje)).toEqual([madrugada, noite]);
  });

  it('ontem e amanhã ficam de fora — o dia é o dia, não uma janela', () => {
    expect(
      contratosTerminamHoje([termina('2026-09-10T23:59:00'), termina('2026-09-12T00:01:00')], hoje)
    ).toEqual([]);
  });

  it('sem data de fim não termina em dia nenhum', () => {
    expect(contratosTerminamHoje([termina(null)], hoje)).toEqual([]);
  });

  // "todos os que terminam naquele dia" — a regra de renovável não se aplica.
  it('não filtra por renovável: curta duração e qualquer regime entram', () => {
    const curta = termina('2026-09-11T10:00:00', { is_longa_duracao: false });
    const tvde = termina('2026-09-11T10:00:00', { regime: 'tvde' });
    const slot = termina('2026-09-11T10:00:00', { regime: 'slot' });
    expect(contratosTerminamHoje([curta, tvde, slot], hoje)).toHaveLength(3);
  });

  it('um contrato já fechado, cancelado ou devolvido não tem nada a fazer', () => {
    for (const estado of ['fechado', 'cancelado', 'devolvido'] as const) {
      expect(
        contratosTerminamHoje(
          [termina('2026-09-11T10:00:00', { estado_operacional: estado })],
          hoje
        )
      ).toEqual([]);
    }
  });

  it('agendado ainda conta — é um contrato vivo', () => {
    const agendado = termina('2026-09-11T10:00:00', { estado_operacional: 'agendado' });
    expect(contratosTerminamHoje([agendado], hoje)).toEqual([agendado]);
  });

  it('substituído ou apagado nunca entra, mesmo a terminar hoje', () => {
    expect(
      contratosTerminamHoje(
        [
          termina('2026-09-11T10:00:00', { substituido_em: '2026-09-01T00:00:00Z' }),
          termina('2026-09-11T10:00:00', { deleted_at: '2026-09-01T00:00:00Z' }),
        ],
        hoje
      )
    ).toEqual([]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(contratosTerminamHoje([], hoje)).toEqual([]);
  });
});
