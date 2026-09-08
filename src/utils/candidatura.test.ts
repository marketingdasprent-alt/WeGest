import { describe, it, expect } from 'vitest';
import { traduzirErro } from './candidatura';

describe('traduzirErro', () => {
  it('cache do schema desactualizado: diz o que fazer, sem mandar procurar migrações', () => {
    // Caso real, 2026-09-08: um motorista não conseguia submeter a candidatura.
    // A mensagem antiga dizia "o administrador precisa de aplicar a migration
    // mais recente" — e não havia migração nenhuma em falta: as 25 colunas do
    // formulário estavam todas na tabela. Era o cache do PostgREST, que se
    // resolve com NOTIFY pgrst, 'reload schema'.
    const msg = traduzirErro(
      "Could not find the 'observacoes' column of 'motorista_candidaturas' in the schema cache"
    );
    expect(msg).toContain('Aguarde um minuto');
    expect(msg).toContain('recarregar o schema');
    expect(msg).not.toContain('migration');
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
