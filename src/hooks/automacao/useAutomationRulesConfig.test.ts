import { describe, it, expect } from 'vitest';
import {
  utilizadoresPorCargo,
  prepararAccaoNova,
  type AccaoParaGravar,
} from './useAutomationRulesConfig';

/**
 * `profiles.nome` e `profiles.email` são NULLABLE na base de dados. Hoje não há
 * nenhum nulo entre os 95 utilizadores com cargo (verificado a 2026-08-26), mas
 * o modal de configuração faz `iniciais(u.nome)` → `nome.trim()`. Um perfil sem
 * nome dava ecrã branco no modal inteiro, não uma linha estranha.
 */
describe('utilizadoresPorCargo', () => {
  const cargos = { u1: 'cargo-a' };

  it('mapeia o perfil e cola-lhe o cargo', () => {
    const [u] = utilizadoresPorCargo([{ id: 'u1', nome: 'Ana Silva', email: 'ana@x.pt' }], cargos);

    expect(u).toEqual({ id: 'u1', nome: 'Ana Silva', email: 'ana@x.pt', cargo_id: 'cargo-a' });
  });

  it('perfil sem nome usa o email — nunca devolve null', () => {
    const [u] = utilizadoresPorCargo([{ id: 'u1', nome: null, email: 'ana@x.pt' }], cargos);

    expect(u.nome).toBe('ana@x.pt');
  });

  it('perfil sem nome nem email continua a ser uma string', () => {
    const [u] = utilizadoresPorCargo([{ id: 'u1', nome: null, email: null }], cargos);

    expect(typeof u.nome).toBe('string');
    expect(u.nome.length).toBeGreaterThan(0);
    expect(u.email).toBe('');
  });

  it('sem perfis devolve lista vazia', () => {
    expect(utilizadoresPorCargo([], cargos)).toEqual([]);
  });
});

/**
 * Uma acção nova (arrastada da paleta, nunca gravada) chega aqui com
 * `template_codigo: ''` e `titulo: ''` — nenhum painel os preenche. Sem
 * isto, `fn_validar_acao_config` recusa a gravação: "template_codigo é
 * obrigatório" — e a segunda acção de uma automação nunca chegava a guardar.
 */
describe('prepararAccaoNova', () => {
  const contexto = { eventType: 'viatura.seguro_expirando', nome: 'Enviar email' };

  it('preenche template_codigo e titulo em falta, numa acção de email', () => {
    const accao: AccaoParaGravar = {
      acaoTipo: 'email',
      acaoConfig: { template_codigo: '', titulo: '', destinatarios_cargo_ids: [] } as never,
      cooldownMinutos: 0,
    };

    const { codigo, acaoConfig } = prepararAccaoNova(accao, contexto);
    const config = acaoConfig as { template_codigo: string; titulo: string };

    expect(codigo).toMatch(/^viatura\.seguro_expirando\.email\.[0-9a-f]{8}$/);
    expect(config.template_codigo).toBe(codigo);
    expect(config.titulo).toBe('Enviar email');
  });

  it('preenche titulo em falta, numa acção de notificação', () => {
    const accao: AccaoParaGravar = {
      acaoTipo: 'notificacao',
      acaoConfig: { template_codigo: '', titulo: '', destinatarios_cargo_ids: [] } as never,
      cooldownMinutos: 60,
    };

    const { acaoConfig } = prepararAccaoNova(accao, contexto);

    expect((acaoConfig as { titulo: string }).titulo).toBe('Enviar email');
  });

  it('nunca pisa um template_codigo/titulo já escolhido', () => {
    const accao: AccaoParaGravar = {
      acaoTipo: 'email',
      acaoConfig: {
        template_codigo: 'ja.escolhido',
        titulo: 'Já tem título',
        destinatarios_cargo_ids: [],
      } as never,
      cooldownMinutos: 0,
    };

    const { acaoConfig } = prepararAccaoNova(accao, contexto);
    const config = acaoConfig as { template_codigo: string; titulo: string };

    expect(config.template_codigo).toBe('ja.escolhido');
    expect(config.titulo).toBe('Já tem título');
  });

  it('não mexe no acao_config de uma acção interna', () => {
    const accao: AccaoParaGravar = {
      acaoTipo: 'automacao_interna',
      acaoConfig: { accao: 'ticket.alterar_estado', valor: 'resolvido' } as never,
      cooldownMinutos: 0,
    };

    const { acaoConfig } = prepararAccaoNova(accao, contexto);

    expect(acaoConfig).toEqual({ accao: 'ticket.alterar_estado', valor: 'resolvido' });
  });

  it('gera um código diferente a cada chamada', () => {
    const accao: AccaoParaGravar = {
      acaoTipo: 'email',
      acaoConfig: { template_codigo: '', titulo: '', destinatarios_cargo_ids: [] } as never,
      cooldownMinutos: 0,
    };

    const a = prepararAccaoNova(accao, contexto);
    const b = prepararAccaoNova(accao, contexto);

    expect(a.codigo).not.toBe(b.codigo);
  });
});
