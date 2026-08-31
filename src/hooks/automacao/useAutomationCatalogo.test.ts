import { describe, expect, it } from 'vitest';
import { accoesParaEvento, camposDoEvento, type AutomationCatalogo } from './useAutomationCatalogo';

/**
 * O catálogo é do servidor; aqui testa-se só como o interpretamos.
 *
 * A fixture é uma cópia fiel do que `public.automation_catalogo()` devolve hoje
 * (migration 20260828220000). Serve para exercitar a interpretação com dados da
 * forma real — quem garante o CONTEÚDO são os testes pgTAP, que leem a função.
 * Se o servidor acrescentar uma acção, nada aqui tem de mudar: é esse o ponto
 * de não duplicar o catálogo em TypeScript.
 */
const CATALOGO: AutomationCatalogo = {
  eventos: {
    'assistencia_ticket.aberto_demasiado_tempo': {
      label: 'Ticket aberto há demasiado tempo',
      modulo: 'Assistência',
      entidade: 'assistencia_tickets',
      campos: [
        { id: 'prioridade', label: 'Prioridade', tipo: 'string' },
        { id: 'status', label: 'Estado', tipo: 'string' },
      ],
    },
    'motorista.ficha_incompleta': {
      label: 'Ficha de motorista incompleta',
      modulo: 'Motoristas',
      entidade: 'motoristas_ativos',
      campos: [{ id: 'nome', label: 'Nome', tipo: 'string' }],
    },
    'viatura.seguro_expirando': {
      label: 'Seguro da viatura a expirar',
      modulo: 'Viaturas',
      entidade: 'viaturas',
      campos: [{ id: 'matricula', label: 'Matrícula', tipo: 'string' }],
    },
  },
  accoes: {
    'motorista.atualizar_campo': {
      label: 'Preencher um campo do motorista',
      modulo: 'Motoristas',
      entidade: 'motoristas_ativos',
      recurso: 'motoristas_editar',
      campos_permitidos: ['observacoes'],
    },
    'viatura.atualizar_campo': {
      label: 'Preencher um campo da viatura',
      modulo: 'Viaturas',
      entidade: 'viaturas',
      recurso: 'viaturas_editar',
      campos_permitidos: ['observacoes'],
    },
    'ticket.alterar_estado': {
      label: 'Alterar o estado do ticket',
      modulo: 'Assistência',
      entidade: 'assistencia_tickets',
      recurso: 'tickets_gerir',
      valores: ['pendente', 'aberto', 'em_andamento', 'aguardando', 'resolvido', 'fechado'],
    },
    // Descritiva, não uma acção interna: entidade null, sem campos_permitidos
    // nem valores. Migration 20260901120000.
    'notificacao.email': {
      label: 'Enviar email',
      modulo: 'Notificações',
      entidade: null,
      recurso: 'automacoes',
    },
  },
};

describe('camposDoEvento', () => {
  it('devolve os campos do payload daquele evento', () => {
    expect(camposDoEvento(CATALOGO, 'assistencia_ticket.aberto_demasiado_tempo')).toEqual([
      { id: 'prioridade', label: 'Prioridade', tipo: 'string' },
      { id: 'status', label: 'Estado', tipo: 'string' },
    ]);
  });

  it('os campos são do evento, não da entidade', () => {
    // O avaliador compara contra o PAYLOAD do evento. Oferecer colunas da
    // tabela dava condições sobre campos que o payload não traz — e um campo
    // ausente é incomparável, portanto a regra nunca disparava e sem erro.
    const campos = camposDoEvento(CATALOGO, 'viatura.seguro_expirando').map((c) => c.id);
    expect(campos).toEqual(['matricula']);
    expect(campos).not.toContain('marca');
  });

  it('sem evento escolhido não há campos que oferecer', () => {
    expect(camposDoEvento(CATALOGO, undefined)).toEqual([]);
  });

  it('evento que o catálogo não conhece não rebenta o painel', () => {
    // Há 19 event_type no motor e 3 no catálogo: a maioria dos gatilhos cai
    // mesmo neste ramo, e tem de dar lista vazia, não excepção.
    expect(camposDoEvento(CATALOGO, 'viatura.iuc_a_pagar')).toEqual([]);
  });

  it('sem catálogo carregado não se inventam campos', () => {
    expect(camposDoEvento(undefined, 'viatura.seguro_expirando')).toEqual([]);
  });
});

describe('accoesParaEvento', () => {
  it('só oferece acções sobre a entidade que o evento traz', () => {
    // O motor recusa uma acção cuja entidade não bate com a do run. Mostrar as
    // outras era oferecer uma escolha que o servidor rejeita ao gravar.
    const ids = accoesParaEvento(CATALOGO, 'viatura.seguro_expirando').map(([id]) => id);
    expect(ids).toEqual(['viatura.atualizar_campo']);
  });

  it('para um ticket oferece a acção do ticket', () => {
    const ids = accoesParaEvento(CATALOGO, 'assistencia_ticket.aberto_demasiado_tempo').map(
      ([id]) => id
    );
    expect(ids).toEqual(['ticket.alterar_estado']);
  });

  it('a entidade do motorista é a tabela real, não o nome do módulo', () => {
    // `motoristas_ativos`, não `motoristas`. Comparar com o nome errado dava
    // uma lista vazia e nenhuma acção configurável naquele evento.
    const ids = accoesParaEvento(CATALOGO, 'motorista.ficha_incompleta').map(([id]) => id);
    expect(ids).toEqual(['motorista.atualizar_campo']);
  });

  it('evento desconhecido devolve tudo em vez de nada', () => {
    // Filtrar por informação que não existe esconderia acções válidas. A
    // autoridade final continua a ser o validador do servidor.
    expect(accoesParaEvento(CATALOGO, 'viatura.iuc_a_pagar')).toHaveLength(4);
  });

  it('uma acção com entidade null nunca aparece para um evento concreto', () => {
    // `notificacao.email` não opera sobre uma entidade do domínio — não é
    // uma acção interna, e não deve competir com elas nessa lista, mesmo
    // quando o "devolve tudo" do evento desconhecido a incluiria.
    const eventos = [
      'viatura.seguro_expirando',
      'motorista.ficha_incompleta',
      'assistencia_ticket.aberto_demasiado_tempo',
    ];
    for (const evento of eventos) {
      const ids = accoesParaEvento(CATALOGO, evento).map(([id]) => id);
      expect(ids).not.toContain('notificacao.email');
    }
  });

  it('sem catálogo carregado não há acções — fail closed', () => {
    expect(accoesParaEvento(undefined, 'viatura.seguro_expirando')).toEqual([]);
  });

  it('não fixa quantas acções existem', () => {
    // Se o servidor acrescentar uma quarta acção sobre viaturas, isto continua
    // verdade sem ninguém ter de editar a UI.
    const daViatura = accoesParaEvento(CATALOGO, 'viatura.seguro_expirando');
    expect(daViatura.every(([, a]) => a.entidade === 'viaturas')).toBe(true);
  });
});

describe('forma das acções', () => {
  it('distingue conjunto fechado de campo livre', () => {
    // É esta diferença que decide se o painel mostra um select de valores ou um
    // select de campos com texto livre ao lado.
    const [, ticket] = accoesParaEvento(CATALOGO, 'assistencia_ticket.aberto_demasiado_tempo')[0];
    expect(ticket.valores).toHaveLength(6);
    expect(ticket.campos_permitidos).toBeUndefined();

    const [, viatura] = accoesParaEvento(CATALOGO, 'viatura.seguro_expirando')[0];
    expect(viatura.campos_permitidos).toEqual(['observacoes']);
    expect(viatura.valores).toBeUndefined();
  });
});
