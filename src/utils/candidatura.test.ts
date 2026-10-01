import { describe, it, expect } from 'vitest';
import { traduzirErro } from './candidatura';

describe('traduzirErro', () => {
  it('campo que a base não reconhece: não manda repetir nem culpa o candidato', () => {
    // Caso real, 2026-09-08: o formulário em produção enviava `iban` e a coluna
    // não existia na tabela. Dois candidatos tentaram doze vezes em 40 minutos e
    // nenhuma tentativa podia resultar — a mensagem de então mandava-os esperar
    // um minuto e tentar de novo, e foi exactamente o que eles fizeram, para nada.
    //
    // Do lado do cliente as duas causas são indistinguíveis (a coluna falta mesmo,
    // ou o cache do PostgREST está velho), por isso a mensagem não pode prometer
    // que a espera resolve. Nomeia as duas para quem for tratar disto.
    const msg = traduzirErro(
      "Could not find the 'iban' column of 'motorista_candidaturas' in the schema cache"
    );
    expect(msg).toContain('avise-nos');
    expect(msg).toContain('falta a coluna');
    expect(msg).toContain('recarregado');
    expect(msg).not.toMatch(/Aguarde|tente novamente|migration/);
  });
  it('RLS vira mensagem de permissão', () => {
    expect(traduzirErro('new row violates row-level security policy')).toContain(
      'Não tem permissão'
    );
  });

  it('sem_permissao_guardar tem mensagem própria', () => {
    expect(traduzirErro('sem_permissao_guardar')).toContain('sessão não tem permissões');
  });

  it('duplicado, rede, sessão e ficheiro grande têm cada um a sua', () => {
    expect(traduzirErro('duplicate key value')).toContain('Já existe um registo');
    expect(traduzirErro('Failed to fetch')).toContain('Falha de ligação');
    expect(traduzirErro('JWT expired')).toContain('sessão expirou');
    expect(traduzirErro('Payload too large')).toContain('demasiado grandes');
  });

  it('erro desconhecido devolve a mensagem original', () => {
    expect(traduzirErro('rebentou tudo')).toBe('rebentou tudo');
  });

  it('sem mensagem devolve o fallback', () => {
    expect(traduzirErro(undefined)).toContain('Ocorreu um erro');
  });
});
