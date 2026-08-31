import { describe, it, expect } from 'vitest';
import type { RegraEstatistica } from '@/hooks/automacao/useAutomacaoStats';
import { agruparPorModulo, contagemPorModulo } from './agrupamento';

/**
 * O agrupamento é lógica pura, e é aqui que se testa — não a renderizar.
 *
 * O que interessa provar não é que agrupa (isso é `reduce`), é a ORDEM e o que
 * acontece aos casos de fronteira: módulos vazios não aparecem, "Outros" fica
 * sempre no fim, e um evento desconhecido não desaparece da lista.
 */
function regra(eventType: string, nome = 'x'): RegraEstatistica {
  return {
    rule_id: `${eventType}-${nome}`,
    nome,
    event_type: eventType,
    ativo: true,
    execucoes: 0,
    falhas: 0,
    ultima_execucao: null,
    duracao_media_ms: null,
  } as unknown as RegraEstatistica;
}

describe('agruparPorModulo', () => {
  it('agrupa as regras pelo módulo do evento', () => {
    const grupos = agruparPorModulo([
      regra('viatura.seguro_expirando', 'seguro'),
      regra('viatura.iuc_a_pagar', 'iuc'),
      regra('contrato_renting.criado', 'contrato'),
    ]);

    expect(grupos.map((g) => g.modulo.nome)).toEqual(['Renting', 'Viaturas']);
    expect(grupos.find((g) => g.modulo.chave === 'viatura')?.regras).toHaveLength(2);
  });

  it('segue a ordem de MODULOS, não a alfabética nem a de chegada', () => {
    // Ordenar por nome punha "Assistência" primeiro só porque começa por A.
    const grupos = agruparPorModulo([
      regra('assistencia_ticket.aberto_demasiado_tempo'),
      regra('viatura.seguro_expirando'),
      regra('contrato_renting.criado'),
    ]);
    expect(grupos.map((g) => g.modulo.nome)).toEqual(['Renting', 'Viaturas', 'Assistência']);
  });

  it('não cria secções para módulos sem regras', () => {
    // Uma secção vazia é ruído: ocupa uma linha para dizer que não há nada.
    const grupos = agruparPorModulo([regra('viatura.seguro_expirando')]);
    expect(grupos).toHaveLength(1);
  });

  it('um evento de módulo desconhecido vai para Outros, no fim', () => {
    // Cair fora da lista era pior do que ficar em Outros: a regra existe,
    // corre, e desaparecia do ecrã que serve para a vigiar.
    const grupos = agruparPorModulo([
      regra('coisa_nova.aconteceu'),
      regra('viatura.seguro_expirando'),
    ]);
    expect(grupos.map((g) => g.modulo.nome)).toEqual(['Viaturas', 'Outros']);
  });

  it('cobranca e invoice caem na mesma secção', () => {
    const grupos = agruparPorModulo([
      regra('cobranca.gerada'),
      regra('invoice.nao_enviada_ao_cliente'),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].modulo.nome).toBe('Financeiro');
    expect(grupos[0].regras).toHaveLength(2);
  });

  it('a ordem das regras dentro da secção é a que veio', () => {
    // A query já ordena; reordenar aqui era decidir duas vezes a mesma coisa.
    const grupos = agruparPorModulo([
      regra('viatura.iuc_a_pagar', 'b'),
      regra('viatura.seguro_expirando', 'a'),
    ]);
    expect(grupos[0].regras.map((r) => r.nome)).toEqual(['b', 'a']);
  });

  it('lista vazia dá zero secções, não uma secção vazia', () => {
    expect(agruparPorModulo([])).toEqual([]);
  });
});

describe('contagemPorModulo', () => {
  it('conta as regras de cada módulo, pela mesma ordem', () => {
    const contagens = contagemPorModulo([
      regra('viatura.seguro_expirando'),
      regra('viatura.iuc_a_pagar'),
      regra('contrato_renting.criado'),
    ]);
    expect(contagens).toEqual([
      { modulo: expect.objectContaining({ nome: 'Renting' }), total: 1 },
      { modulo: expect.objectContaining({ nome: 'Viaturas' }), total: 2 },
    ]);
  });

  it('só devolve módulos que têm regras', () => {
    // Um chip que filtra para zero resultados é um convite a um ecrã vazio.
    const contagens = contagemPorModulo([regra('viatura.seguro_expirando')]);
    expect(contagens).toHaveLength(1);
    expect(contagens[0].total).toBe(1);
  });

  it('sem regras não há chips', () => {
    expect(contagemPorModulo([])).toEqual([]);
  });
});
