import { describe, it, expect } from 'vitest';
import { mensagemFalhaEmissao } from './faturacaoFalha';
// Fonte única — o ficheiro é TS puro, sem APIs de Deno, por isso o Vitest importa-o.
import {
  linhaDeFalhaEmissao,
  MAX_ERRO_FALHA,
  type ContextoFalhaEmissao,
} from '../../supabase/functions/_shared/faturacao/falhas';

describe('mensagemFalhaEmissao', () => {
  it('leva o motivo vindo de um Error', () => {
    const msg = mensagemFalhaEmissao(new Error('insertDocument falhou: Série inválida'));
    expect(msg).toContain('Fatura registada na conta-corrente');
    expect(msg).toContain('Motivo: insertDocument falhou: Série inválida.');
    expect(msg).toContain('Reemita-o na lista de faturas');
  });

  it('lê a mensagem de um erro plain do supabase-js', () => {
    expect(mensagemFalhaEmissao({ message: 'permission denied for table clientes' })).toContain(
      'Motivo: permission denied for table clientes.'
    );
  });

  it('sem mensagem diz que o motivo é desconhecido', () => {
    expect(mensagemFalhaEmissao(undefined)).toContain('Motivo: motivo desconhecido.');
    expect(mensagemFalhaEmissao({ message: '' })).toContain('Motivo: motivo desconhecido.');
  });

  it('motivo que já acaba em pontuação não sai com dois pontos seguidos', () => {
    const msg = mensagemFalhaEmissao(new Error('Nada foi emitido.'));
    expect(msg).toContain('Motivo: Nada foi emitido. Reemita-o');
    expect(msg).not.toContain('..');
    expect(mensagemFalhaEmissao(new Error('Recusado!  '))).toContain('Motivo: Recusado. ');
    expect(mensagemFalhaEmissao(new Error('...'))).toContain('Motivo: motivo desconhecido.');
  });

  it('numa reserva o registo local chama-se reserva', () => {
    expect(mensagemFalhaEmissao(new Error('x'), 'reserva')).toMatch(/^Reserva faturada/);
  });

  it('com classe unknown avisa que pode ter sido emitido e nunca manda reemitir às cegas', () => {
    const erro = Object.assign(new Error('O agente apanhou o pedido e não respondeu'), {
      classe: 'unknown',
    });
    const msg = mensagemFalhaEmissao(erro);
    expect(msg).toContain('PODE ter sido');
    expect(msg).toContain('Motivo: O agente apanhou o pedido e não respondeu.');
    expect(msg).toContain('Confirme no software de faturação antes de reemitir');
    expect(msg).not.toContain('NÃO foi emitido');
    expect(msg).not.toContain('Reemita-o');
  });

  it('falha de transporte (unknown) não manda reemitir', () => {
    const erro = Object.assign(new Error('Falha a contactar o serviço de faturação'), {
      classe: 'unknown',
    });
    const msg = mensagemFalhaEmissao(erro, 'reserva');
    expect(msg).toMatch(/^Reserva faturada/);
    expect(msg).toContain('PODE ter sido');
    expect(msg).not.toContain('Reemita-o');
  });

  it('numa nota de crédito não fala em fatura nem manda reemitir às cegas', () => {
    const naoEmitida = mensagemFalhaEmissao(
      Object.assign(new Error('Série inválida'), { classe: 'known_failed' }),
      'nota_credito'
    );
    expect(naoEmitida).toMatch(/^Crédito registado na conta-corrente/);
    expect(naoEmitida).toContain('nota de crédito NÃO foi emitida');
    expect(naoEmitida).not.toContain('Fatura');

    const incerta = mensagemFalhaEmissao(
      Object.assign(new Error('timeout'), { classe: 'unknown' }),
      'nota_credito'
    );
    expect(incerta).toContain('PODE ter sido');
    expect(incerta).toContain('antes de emitir outra');
    expect(incerta).not.toContain('NÃO foi emitida');
  });

  it('com classe known_failed mantém o aviso de que não foi emitido', () => {
    const erro = Object.assign(new Error('Série inválida'), { classe: 'known_failed' });
    expect(mensagemFalhaEmissao(erro)).toContain('NÃO foi emitido');
  });
});

describe('linhaDeFalhaEmissao', () => {
  const base: ContextoFalhaEmissao = {
    orgId: 'org-1',
    pedido: {
      tipo: 'FT',
      contrato_id: 'contrato-1',
      cobranca_id: 'cobranca-1',
      referencia_externa: 'Contrato #0933',
      itens: [{}, {}],
    },
    erro: 'insertDocument falhou: Série inválida',
    classe: 'known_failed',
    provider: 'keyinvoice',
    integracaoId: 'int-sul',
    emissorId: 'empresa-sul',
  };

  it('sem organização não regista nada (org_id é NOT NULL)', () => {
    expect(linhaDeFalhaEmissao({ ...base, orgId: null })).toBeNull();
  });

  it('a cobrança é a origem quando existe e o erro vai com contexto', () => {
    const linha = linhaDeFalhaEmissao(base);
    expect(linha).toMatchObject({
      source_table: 'contrato_cobrancas',
      source_id: 'cobranca-1',
      org_id: 'org-1',
      job_type: 'faturacao.emitir.FT',
      attempts: 1,
    });
    expect(linha?.last_error).toBe(
      'Emissão FT (keyinvoice) · Contrato #0933: insertDocument falhou: Série inválida'
    );
  });

  it('sem cobrança cai no contrato; sem os dois usa um id gerado', () => {
    const semCobranca = linhaDeFalhaEmissao({
      ...base,
      pedido: { ...base.pedido, cobranca_id: undefined },
    });
    expect(semCobranca).toMatchObject({
      source_table: 'contratos_renting',
      source_id: 'contrato-1',
    });

    const semNada = linhaDeFalhaEmissao(
      { ...base, pedido: { tipo: 'NC', documento_referencia: '4 4/90' } },
      () => 'uuid-gerado'
    );
    expect(semNada).toMatchObject({ source_table: 'faturacao_emitir', source_id: 'uuid-gerado' });
    expect(semNada?.last_error).toContain('· 4 4/90:');
  });

  it('o payload só leva identificadores, nunca os dados do cliente', () => {
    const pedidoComCliente = {
      ...base.pedido,
      cliente: { nome: 'Fulano', nif: '123456789' },
    } as ContextoFalhaEmissao['pedido'];
    const linha = linhaDeFalhaEmissao({ ...base, pedido: pedidoComCliente });
    expect(linha?.payload).toEqual({
      action: 'emit',
      tipo: 'FT',
      classe: 'known_failed',
      provider: 'keyinvoice',
      integracao_id: 'int-sul',
      emissor_id: 'empresa-sul',
      contrato_id: 'contrato-1',
      cobranca_id: 'cobranca-1',
      referencia_externa: 'Contrato #0933',
      documento_referencia: null,
      n_itens: 2,
    });
    expect(linha?.payload).not.toHaveProperty('cliente');
    expect(linha?.payload).not.toHaveProperty('itens');
  });

  it('sem provider resolvido diz-o e corta erros gigantes', () => {
    const linha = linhaDeFalhaEmissao({
      ...base,
      provider: undefined,
      erro: 'x'.repeat(MAX_ERRO_FALHA + 500),
    });
    expect(linha?.last_error.startsWith('Emissão FT (provider por resolver)')).toBe(true);
    expect(linha?.last_error).toHaveLength(MAX_ERRO_FALHA);
  });
});
