import { describe, it, expect } from 'vitest';
import {
  CATALOGO,
  OPERADORES,
  criarNoDoTemplate,
  eventosDoModulo,
  rotuloDoEvento,
  visualDoBloco,
} from './catalogo';

describe('CATALOGO', () => {
  it('as chaves são únicas — é por elas que o drop identifica o template', () => {
    const chaves = CATALOGO.map((t) => t.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('só existem os três tipos que o canvas sabe desenhar', () => {
    const tipos = new Set(CATALOGO.map((t) => t.tipo));
    expect([...tipos].sort()).toEqual(['accao', 'condicao', 'trigger']);
  });

  it('há gatilhos para os módulos do WeGest e acções para agir sobre eles', () => {
    const modulos = CATALOGO.filter((t) => t.tipo === 'trigger').map((t) => t.rotulo);
    expect(modulos).toEqual(
      expect.arrayContaining(['Renting', 'Motoristas', 'Viaturas', 'Financeiro', 'Assistência'])
    );
    expect(CATALOGO.filter((t) => t.tipo === 'accao').length).toBeGreaterThanOrEqual(2);
    expect(CATALOGO.filter((t) => t.tipo === 'condicao').length).toBeGreaterThanOrEqual(1);
  });

  it('todo o gatilho tem pelo menos um evento para escolher', () => {
    for (const t of CATALOGO.filter((x) => x.tipo === 'trigger')) {
      const modulo = (t.dados as { modulo: string }).modulo;
      expect(eventosDoModulo(modulo).length, `módulo ${modulo}`).toBeGreaterThan(0);
    }
  });

  it('os eventos são os que existem mesmo no motor', () => {
    expect(eventosDoModulo('viatura')).toContain('viatura.seguro_expirando');
    expect(eventosDoModulo('motorista')).toContain('motorista.carta_expirando');
  });

  it('módulo desconhecido devolve lista vazia em vez de rebentar', () => {
    expect(eventosDoModulo('inexistente')).toEqual([]);
  });
});

describe('rotuloDoEvento', () => {
  it('todo o evento que se pode escolher tem nome legível', () => {
    // Sem isto, acrescentar um evento ao catálogo e esquecer o rótulo deixava
    // o utilizador a escolher entre identificadores crus.
    const semRotulo = CATALOGO.filter((t) => t.tipo === 'trigger')
      .flatMap((t) => eventosDoModulo((t.dados as { modulo: string }).modulo))
      .filter((e) => rotuloDoEvento(e) === e);

    expect(semRotulo).toEqual([]);
  });

  it('escreve os acrónimos como se escrevem', () => {
    // Uma tradução mecânica dava "Iuc a pagar" e "Licenca tvde expirando" —
    // é a razão de o mapa ser escrito à mão em vez de gerado.
    expect(rotuloDoEvento('viatura.iuc_a_pagar')).toContain('IUC');
    expect(rotuloDoEvento('motorista.licenca_tvde_expirando')).toContain('TVDE');
    expect(rotuloDoEvento('viatura.inspecao_expirando')).toContain('IPO');
  });

  it('leva os acentos que o identificador não pode ter', () => {
    expect(rotuloDoEvento('viatura.inspecao_expirando')).toContain('Inspeção');
    expect(rotuloDoEvento('cobranca.gerada')).toContain('Cobrança');
  });

  it('evento desconhecido devolve o identificador em vez de nada', () => {
    // Um evento novo no motor não pode fazer o editor mostrar vazio.
    expect(rotuloDoEvento('coisa.nova')).toBe('coisa.nova');
  });
});

describe('OPERADORES', () => {
  it('só oferece os operadores que o motor sabe avaliar', () => {
    // `process_domain_events` só trata '=' e '!='. Qualquer outro operador cai
    // fora dos dois ramos e a condição passa SEMPRE — oferecer '>' ou
    // 'contém' dava um filtro que parecia funcionar e não filtrava nada.
    expect(OPERADORES.map((o) => o.valor)).toEqual(['=', '!=']);
  });
});

describe('visualDoBloco', () => {
  it('cada bloco do catálogo tem a sua própria cor', () => {
    // Todos com a mesma cor tornava o canvas uma parede de cartões iguais —
    // era exactamente o problema que isto veio resolver.
    const cores = CATALOGO.map((t) => t.cor);
    expect(new Set(cores).size).toBe(CATALOGO.length);
  });

  it('as cores são tokens do tema, não valores fixos', () => {
    // Um hex fixo ficava ilegível em tema escuro.
    for (const t of CATALOGO) {
      expect(t.cor, t.chave).toMatch(/^--fluxo-/);
    }
  });

  it('resolve o visual de um gatilho pelo módulo', () => {
    const renting = CATALOGO.find((t) => t.chave === 'trigger-renting')!;
    const visual = visualDoBloco('trigger', { modulo: 'contrato_renting' });

    expect(visual.Icone).toBe(renting.Icone);
    expect(visual.cor).toBe(renting.cor);
  });

  it('resolve o visual de uma acção pelo tipo de acção', () => {
    const notificar = CATALOGO.find((t) => t.chave === 'notificacao')!;
    const alterar = CATALOGO.find((t) => t.chave === 'alterar-estado')!;

    expect(visualDoBloco('accao', { accao: 'notificacao' }).cor).toBe(notificar.cor);
    expect(visualDoBloco('accao', { accao: 'alterar_estado' }).cor).toBe(alterar.cor);
  });

  it('a condição tem visual próprio', () => {
    const condicao = CATALOGO.find((t) => t.tipo === 'condicao')!;
    expect(visualDoBloco('condicao', {}).cor).toBe(condicao.cor);
  });

  it('bloco desconhecido tem visual de recurso em vez de undefined', () => {
    const visual = visualDoBloco('trigger', { modulo: 'inexistente' });
    expect(visual.Icone).toBeTruthy();
    expect(visual.cor).toMatch(/^--fluxo-/);
  });

  it('gatilhos diferentes dão cores diferentes', () => {
    const a = visualDoBloco('trigger', { modulo: 'viatura' });
    const b = visualDoBloco('trigger', { modulo: 'motorista' });
    expect(a.cor).not.toBe(b.cor);
  });
});

describe('criarNoDoTemplate', () => {
  const trigger = CATALOGO.find((t) => t.tipo === 'trigger')!;

  it('cria o nó na posição onde foi largado', () => {
    const criado = criarNoDoTemplate(trigger, { x: 320, y: 180 }, 1);

    expect(criado.position).toEqual({ x: 320, y: 180 });
    expect(criado.type).toBe(trigger.tipo);
  });

  it('dois nós do mesmo template não partilham id', () => {
    const a = criarNoDoTemplate(trigger, { x: 0, y: 0 }, 1);
    const b = criarNoDoTemplate(trigger, { x: 0, y: 0 }, 2);

    expect(a.id).not.toBe(b.id);
  });

  it('o nó nasce com a configuração por omissão do template, copiada', () => {
    const a = criarNoDoTemplate(trigger, { x: 0, y: 0 }, 1);
    const b = criarNoDoTemplate(trigger, { x: 0, y: 0 }, 2);
    (a.data as { rotulo: string }).rotulo = 'mudado';

    expect((b.data as { rotulo: string }).rotulo).not.toBe('mudado');
  });

  it('a acção de notificação nasce com cooldown e sem cargos escolhidos', () => {
    const accao = CATALOGO.find((t) => t.chave === 'notificacao')!;
    const criado = criarNoDoTemplate(accao, { x: 0, y: 0 }, 1);

    expect(criado.data).toMatchObject({ cargoIds: [], cooldownMinutos: expect.any(Number) });
  });

  it('a condição nasce com o operador que o motor aceita', () => {
    const condicao = CATALOGO.find((t) => t.tipo === 'condicao')!;
    const criado = criarNoDoTemplate(condicao, { x: 0, y: 0 }, 1);

    expect(criado.data).toMatchObject({ campo: '', operador: '=', valor: '' });
  });

  it('nem o ícone nem a cor entram nos dados do nó', () => {
    // O serializar copia `data` inteiro para o payload; um componente React
    // lá dentro parte o JSON, e a cor não é lógica nenhuma.
    const criado = criarNoDoTemplate(trigger, { x: 0, y: 0 }, 1);
    const dados = criado.data as Record<string, unknown>;

    expect(dados.Icone).toBeUndefined();
    expect(dados.cor).toBeUndefined();
  });
});
