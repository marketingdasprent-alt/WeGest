import { describe, it, expect } from 'vitest';
import {
  MODULOS,
  chaveDoEvento,
  identidadeDoModulo,
  moduloDoEvento,
  TODOS_OS_MODULOS,
} from './rotulos';

/**
 * Os 19 `event_type` que existem em produção (verificado a 2026-08-26, 5 regras
 * cada = 95). Se aparecer um prefixo novo cai em "Outros" — o teste abaixo
 * garante que nenhum dos que existem HOJE cai lá.
 */
const EVENTOS_EM_PRODUCAO = [
  'assistencia_ticket.aberto_demasiado_tempo',
  'cobranca.gerada',
  'contrato_renting.criado',
  'contrato_renting.fechado_com_danos',
  'contrato_renting.renovacao_proxima',
  'contrato_renting.sem_checkin',
  'invoice.nao_enviada_ao_cliente',
  'motorista.candidatura_parada',
  'motorista.carta_expirando',
  'motorista.ficha_incompleta',
  'motorista.licenca_tvde_expirando',
  'motorista.reparacao_cobranca',
  'seguranca.login_suspeito',
  'utilizador.criado',
  'viatura.extintor_expirando',
  'viatura.inspecao_expirando',
  'viatura.iuc_a_pagar',
  'viatura.manutencao_preventiva_expirando',
  'viatura.seguro_expirando',
];

describe('moduloDoEvento', () => {
  it('nenhum evento existente em produção cai em "Outros"', () => {
    const semModulo = EVENTOS_EM_PRODUCAO.filter((e) => moduloDoEvento(e) === 'Outros');
    expect(semModulo).toEqual([]);
  });

  it('traduz o prefixo para o nome do módulo', () => {
    expect(moduloDoEvento('viatura.seguro_expirando')).toBe('Viaturas');
    expect(moduloDoEvento('contrato_renting.criado')).toBe('Renting');
    expect(moduloDoEvento('assistencia_ticket.aberto_demasiado_tempo')).toBe('Assistência');
    expect(moduloDoEvento('seguranca.login_suspeito')).toBe('Segurança');
  });

  it('cobranca e invoice caem ambos em Financeiro — é o mesmo módulo no produto', () => {
    expect(moduloDoEvento('cobranca.gerada')).toBe('Financeiro');
    expect(moduloDoEvento('invoice.nao_enviada_ao_cliente')).toBe('Financeiro');
  });

  it('prefixo desconhecido é "Outros" em vez de rebentar', () => {
    expect(moduloDoEvento('coisa_nova.aconteceu')).toBe('Outros');
  });

  it('evento sem ponto não rebenta', () => {
    expect(moduloDoEvento('malformado')).toBe('Outros');
    expect(moduloDoEvento('')).toBe('Outros');
  });
});

/**
 * A CHAVE, e porque ela existe além do nome.
 *
 * O filtro guardava o nome legível ('Viaturas') e passava-o ao painel de
 * blocos do construtor, que compara com `dados.modulo` do catálogo — que é a
 * chave ('viatura'). Nunca coincidiam: filtrar por módulo na lista e abrir o
 * canvas deixava a paleta sem um único gatilho, em silêncio.
 *
 * O teste antigo do painel passava porque lhe davam a chave à mão. Provava que
 * a função funcionava; não que o chamador lhe desse o que ela espera.
 */
describe('chaveDoEvento', () => {
  it('devolve a chave que o catálogo do construtor usa, não o nome legível', () => {
    expect(chaveDoEvento('viatura.seguro_expirando')).toBe('viatura');
    expect(chaveDoEvento('contrato_renting.criado')).toBe('contrato_renting');
    expect(chaveDoEvento('assistencia_ticket.aberto_demasiado_tempo')).toBe('assistencia_ticket');
  });

  it('invoice colapsa na chave de cobranca — um módulo, uma chave', () => {
    // Sem isto havia duas chaves para o mesmo módulo, e o filtro de Financeiro
    // escondia metade das regras que dizia mostrar.
    expect(chaveDoEvento('invoice.nao_enviada_ao_cliente')).toBe('cobranca');
    expect(chaveDoEvento('cobranca.gerada')).toBe('cobranca');
  });

  it('prefixo desconhecido tem chave própria em vez de nenhuma', () => {
    expect(chaveDoEvento('coisa_nova.aconteceu')).toBe('outros');
    expect(chaveDoEvento('')).toBe('outros');
  });

  it('nome e chave descrevem sempre o mesmo módulo', () => {
    for (const evento of EVENTOS_EM_PRODUCAO) {
      expect(identidadeDoModulo(chaveDoEvento(evento)).nome).toBe(moduloDoEvento(evento));
    }
  });
});

describe('identidadeDoModulo', () => {
  it('cada módulo traz nome, cor e ícone', () => {
    const viaturas = identidadeDoModulo('viatura');
    expect(viaturas.nome).toBe('Viaturas');
    expect(viaturas.token).toBe('--fluxo-viaturas');
    expect(viaturas.Icone).toBeTruthy();
  });

  it('todos os módulos têm token de cor próprio', () => {
    // Dois módulos com a mesma cor seriam indistinguíveis, que é o problema
    // que isto existe para resolver.
    const tokens = MODULOS.map((m) => m.token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('chave desconhecida cai em Outros em vez de rebentar', () => {
    // Um módulo novo no motor não pode dar ecrã em branco na lista.
    expect(identidadeDoModulo('inventado').nome).toBe('Outros');
    expect(identidadeDoModulo('inventado').token).toBe('--fluxo-outros');
  });

  it('o valor "todos" não é um módulo', () => {
    expect(MODULOS.some((m) => m.chave === TODOS_OS_MODULOS)).toBe(false);
  });
});
