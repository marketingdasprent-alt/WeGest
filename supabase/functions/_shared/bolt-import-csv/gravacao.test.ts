// supabase/functions/_shared/bolt-import-csv/gravacao.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { construirArgsMergeCsv, linhaSemConteudo } from './gravacao.ts';

const CONTEXTO = {
  integracaoId: '5c322448-821b-46cd-9779-2592a0f12c31',
  orgId: '11111111-1111-1111-1111-111111111111',
  periodo: '2026-09-07 a 2026-09-13',
  periodoInicio: '2026-09-07',
  periodoFim: '2026-09-13',
  importadoEm: '2026-09-14T10:17:00.000Z',
};

/** Uma linha do CSV como o importador a constrói. */
const LINHA = {
  integracao_id: CONTEXTO.integracaoId,
  org_id: CONTEXTO.orgId,
  periodo: CONTEXTO.periodo,
  chave_motorista: 'bolt-12345',
  identificador_motorista: 'bolt-12345',
  motorista_nome: 'Ana Condutora',
  email: 'ana@exemplo.pt',
  ganhos_brutos_app: 812.5,
  ganhos_campanha: 40,
  viagens_terminadas: 61,
  motorista_id: '22222222-2222-2222-2222-222222222222',
  raw_data: { linha: 'original' },
};

Deno.test('os argumentos vão para a RPC com o período e a org da integração', () => {
  const args = construirArgsMergeCsv(LINHA, CONTEXTO);

  assertEquals(args.p_integracao_id, CONTEXTO.integracaoId);
  assertEquals(args.p_org_id, CONTEXTO.orgId);
  assertEquals(args.p_periodo, CONTEXTO.periodo);
  assertEquals(args.p_periodo_inicio, '2026-09-07');
  assertEquals(args.p_periodo_fim, '2026-09-13');
  assertEquals(args.p_importado_em, CONTEXTO.importadoEm);
});

Deno.test('os valores do CSV seguem inteiros em p_valores', () => {
  const args = construirArgsMergeCsv(LINHA, CONTEXTO);

  assertEquals(args.p_valores.ganhos_brutos_app, 812.5);
  assertEquals(args.p_valores.ganhos_campanha, 40);
  assertEquals(args.p_valores.viagens_terminadas, 61);
  assertEquals(args.p_valores.chave_motorista, 'bolt-12345');
  assertEquals(args.p_valores.raw_data, { linha: 'original' });
});

Deno.test('o motorista correspondido vai em p_motorista_id', () => {
  const args = construirArgsMergeCsv(LINHA, CONTEXTO);
  assertEquals(args.p_motorista_id, '22222222-2222-2222-2222-222222222222');
});

Deno.test('sem correspondência, p_motorista_id vai nulo e não indefinido', () => {
  const { motorista_id: _semDono, ...semMotorista } = LINHA;
  const args = construirArgsMergeCsv(semMotorista, CONTEXTO);
  assertEquals(args.p_motorista_id, null);
});

// A asserção que interessa mais do que todas as outras.
//
// p_escrever_viagens é a porta de serviço da RPC: passado a `true`, o CSV
// escreve as viagens mesmo numa integração ligada à API oficial, saltando por
// cima da guarda que a migração 20260813220000 pôs lá precisamente para isso
// não acontecer. Se algum dia alguém o puser a true "para o import ficar
// completo", as quatro integrações Bolt da Década Ousada passam a ter as
// viagens do ficheiro por cima das da API — que é o bug que essa migração
// fechou. Tem de ir nulo: quem decide é a RPC, pelo auth_mode.
Deno.test('p_escrever_viagens vai nulo — quem decide é a RPC, pelo auth_mode', () => {
  const args = construirArgsMergeCsv(LINHA, CONTEXTO);
  assertEquals(args.p_escrever_viagens, null);
});

// ---------------------------------------------------------------------------
// Linhas sem conteúdo nenhum
// ---------------------------------------------------------------------------
//
// O CSV do portal lista TODOS os motoristas registados na empresa Bolt, não só
// os que trabalharam. Normalmente não se nota, porque quase todos têm ganhos.
// Na Bolt Distancia Lisboa, cuja frota mudou para outra empresa em 2026-08-10,
// o ficheiro de 2026-09-07 trouxe 393 linhas das quais 392 eram zeros a toda a
// largura — e todas elas viraram registos na semana.

Deno.test('uma linha sem ganhos, sem campanha e sem actividade não se grava', () => {
  assertEquals(
    linhaSemConteudo({
      motorista_nome: 'Quem Não Trabalhou',
      identificador_motorista: 'bolt-000',
      ganhos_brutos_total: 0,
      ganhos_liquidos: 0,
      ganhos_campanha: 0,
      viagens_terminadas: 0,
      tempo_online_min: 0,
      distancia_total_km: 0,
    }),
    true,
  );
});

Deno.test('uma linha só com campanha grava-se — é o que o CSV traz de único', () => {
  // Numa integração oauth as parcelas de viagens são zeradas de propósito pela
  // RPC: a campanha pode ser a ÚNICA coisa que sobra, e é precisamente a que
  // não se pode perder.
  assertEquals(
    linhaSemConteudo({
      motorista_nome: 'Só Campanha',
      ganhos_brutos_total: 0,
      viagens_terminadas: 0,
      ganhos_campanha: 12.5,
    }),
    false,
  );
});

Deno.test('uma linha só com actividade grava-se', () => {
  assertEquals(
    linhaSemConteudo({ motorista_nome: 'Andou sem ganhar', viagens_terminadas: 3 }),
    false,
  );
});

Deno.test('valores negativos contam como conteúdo', () => {
  // Um acerto negativo é dinheiro tanto como um positivo.
  assertEquals(
    linhaSemConteudo({ motorista_nome: 'Acerto', reembolsos_passageiros: -40 }),
    false,
  );
});

Deno.test('campos ausentes são o mesmo que zero', () => {
  assertEquals(linhaSemConteudo({ motorista_nome: 'Vazio' }), true);
});
