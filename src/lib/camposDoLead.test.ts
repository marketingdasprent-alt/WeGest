import { describe, it, expect } from 'vitest';
import { respostasDoLead, saoRespostasDeFormulario, observacoesLegiveis } from './camposDoLead';

// O caso real que apareceu no kanban: o cartão do lead "Thiago Teste" mostrava
// o JSON em bruto onde devia estar a resposta.
const OBSERVACOES_REAIS = JSON.stringify({
  field_1788276699230: {
    label: 'Qual é a sua situação atual?',
    value: 'Já tenho licença TVDE',
    type: 'select',
  },
  field_1788275500857: { label: 'E-mail', value: 'thiago.sousa@dasprent.pt', type: 'email' },
  field_1788275500858: { label: 'Telemóvel', value: '+351 910320111', type: 'phone' },
});

describe('respostasDoLead', () => {
  it('lê as respostas do formulário', () => {
    expect(respostasDoLead(OBSERVACOES_REAIS)).toEqual([
      { label: 'Qual é a sua situação atual?', value: 'Já tenho licença TVDE' },
      { label: 'E-mail', value: 'thiago.sousa@dasprent.pt' },
      { label: 'Telemóvel', value: '+351 910320111' },
    ]);
  });

  it('descarta campos sem pergunta ou sem resposta', () => {
    const dados = JSON.stringify({
      field_1: { label: 'Nome', value: 'Ana' },
      field_2: { label: 'Zona', value: '' },
      field_3: { label: '', value: 'órfão' },
      field_4: { label: 'Idade', value: 0 },
    });
    expect(respostasDoLead(dados)).toEqual([
      { label: 'Nome', value: 'Ana' },
      { label: 'Idade', value: '0' },
    ]);
  });

  it('não trata como respostas um texto escrito à mão', () => {
    for (const texto of ['Ligou hoje, remarcar', '', null, undefined, 'não é json {']) {
      expect(respostasDoLead(texto)).toEqual([]);
    }
  });

  it('ignora JSON que não venha do formulário', () => {
    // Sem chaves `field_` não são respostas — pode ser qualquer outra coisa.
    expect(respostasDoLead('{"nota":"qualquer coisa"}')).toEqual([]);
    expect(respostasDoLead('[1,2,3]')).toEqual([]);
  });
});

describe('saoRespostasDeFormulario', () => {
  it('distingue respostas de texto livre', () => {
    expect(saoRespostasDeFormulario(OBSERVACOES_REAIS)).toBe(true);
    expect(saoRespostasDeFormulario('Ligou hoje, remarcar')).toBe(false);
  });
});

describe('observacoesLegiveis', () => {
  it('transforma as respostas em texto para o cartão', () => {
    expect(observacoesLegiveis(OBSERVACOES_REAIS)).toBe(
      'Qual é a sua situação atual?: Já tenho licença TVDE · E-mail: thiago.sousa@dasprent.pt · Telemóvel: +351 910320111'
    );
  });

  it('deixa passar o texto escrito à mão tal como está', () => {
    expect(observacoesLegiveis('  Ligou hoje, remarcar  ')).toBe('Ligou hoje, remarcar');
    expect(observacoesLegiveis(null)).toBe('');
  });
});
