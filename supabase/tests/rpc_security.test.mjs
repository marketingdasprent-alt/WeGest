import assert from 'node:assert/strict';
import test from 'node:test';
import { asRole, createFixture, ids, seedFixture } from './rpc_security_fixture.mjs';

const id = ids;
// F03 (salvar_precos_modelo_tarifa) saiu desta suite: a correção vive em
// 20260925100000 e é coberta por supabase/tests/salvar_precos_modelo_tarifa.test.sql.
const internalCalls = [
  ['SELECT public.fn_ensure_cliente_condutor($1, $2)', [id.motoristaA, id.orgA]],
  ['SELECT public.gerar_movimentos_recorrentes(0)', []],
  ['SELECT public.gerar_seguros_semanais(0)', []],
  ['SELECT * FROM public.via_verde_sync_queue_claim(1000)', []],
  [
    "SELECT public.fn_slot_inserir_cobranca(NULL::public.reservas, current_date, current_date, 123, 'Tentativa')",
    [],
  ],
  ['SELECT public.gerar_cobrancas_slot_mensais()', []],
];

async function denied(db, sql, params, code = '42501') {
  await db.exec('SAVEPOINT expected_error;');
  try {
    await assert.rejects(db.query(sql, params), (error) => error.code === code);
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT expected_error; RELEASE SAVEPOINT expected_error;');
  }
}

const scalar = async (db, sql) => Object.values((await db.query(sql)).rows[0])[0];

test('F04–F06: SQL real e permissões entre organizações', async (t) => {
  const db = await createFixture();
  try {
    await seedFixture(db);
    const scenario = (name, run) =>
      t.test(name, async () => {
        await db.exec('BEGIN;');
        try {
          await run();
        } finally {
          await db.exec('ROLLBACK;');
        }
      });

    await scenario('anon não executa as RPCs nem os seus wrappers internos', async () => {
      await asRole(db, 'anon', undefined, async () => {
        for (const [sql, params] of internalCalls) await denied(db, sql, params);
      });
    });

    await scenario('leitor e administradores A/B não executam helpers internos', async () => {
      for (const user of [id.readerA, id.adminA, id.adminB]) {
        await asRole(db, 'authenticated', user, async () => {
          for (const [sql, params] of internalCalls) await denied(db, sql, params);
        });
      }
      assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.motorista_financeiro'), 0);
      assert.equal(
        await scalar(
          db,
          "SELECT count(*)::int FROM public.via_verde_sync_queue WHERE status = 'running'"
        ),
        0
      );
      assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.clientes'), 1);
    });

    await scenario('helper rejeita origem/destino diferentes mesmo em service role', async () => {
      await asRole(db, 'service_role', undefined, () =>
        denied(db, 'SELECT public.fn_ensure_cliente_condutor($1, $2)', [id.motoristaB, id.orgA])
      );
      assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.clientes'), 1);
      assert.equal(
        await scalar(
          db,
          `SELECT cliente_id FROM public.motoristas_ativos WHERE id = '${id.motoristaB}'`
        ),
        null
      );
    });

    await scenario('helper rejeita cliente em cache que pertence a outra organização', async () => {
      await asRole(db, 'service_role', undefined, () =>
        denied(db, 'SELECT public.fn_ensure_cliente_condutor($1, $2)', [id.motoristaCache, id.orgA])
      );
      assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.clientes'), 1);
    });

    await scenario('helper interno cria e reutiliza cliente sem copiar PII de B', async () => {
      await asRole(db, 'service_role', undefined, async () => {
        const first = await db.query('SELECT public.fn_ensure_cliente_condutor($1, $2) AS id', [
          id.motoristaA,
          id.orgA,
        ]);
        const second = await db.query('SELECT public.fn_ensure_cliente_condutor($1, $2) AS id', [
          id.motoristaA,
          id.orgA,
        ]);
        assert.deepEqual(second.rows, first.rows);
      });
      assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.clientes'), 2);
      assert.equal(
        await scalar(db, `SELECT email FROM public.clientes WHERE org_id = '${id.orgA}'`),
        'a@example.test'
      );
    });

    await scenario(
      'trigger real de reserva continua a chamar o helper após revogar authenticated',
      async () => {
        await asRole(db, 'authenticated', id.adminA, () =>
          db.query(
            `INSERT INTO public.reservas
        (org_id, codigo, data_inicio, data_fim, regime, estado, slot_valor_mensal, condutor_id)
        VALUES ($1, 1, current_date, current_date + 60, 'slot', 'confirmada', 123, $2)`,
            [id.orgA, id.motoristaA]
          )
        );
        assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.contrato_cobrancas'), 1);
        assert.equal(await scalar(db, 'SELECT org_id FROM public.contrato_cobrancas'), id.orgA);
        await asRole(db, 'service_role', undefined, async () => {
          assert.equal(
            await scalar(
              db,
              `SELECT public.fn_slot_inserir_cobranca(r, current_date, current_date + 6, 123, 'Semana') FROM public.reservas r LIMIT 1`
            ),
            1
          );
          assert.equal(await scalar(db, 'SELECT public.gerar_cobrancas_slot_mensais()'), 0);
        });
      }
    );

    await scenario(
      'cron proprietário gera a semana corrente e mantém idempotência e contadores',
      async () => {
        assert.equal(await scalar(db, 'SELECT public.gerar_movimentos_recorrentes(0)'), 2);
        assert.equal(await scalar(db, 'SELECT public.gerar_movimentos_recorrentes(0)'), 0);
        assert.equal(await scalar(db, 'SELECT public.gerar_seguros_semanais(0)'), 2);
        assert.equal(await scalar(db, 'SELECT public.gerar_seguros_semanais(0)'), 0);
        assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.motorista_financeiro'), 4);
        assert.equal(
          await scalar(
            db,
            'SELECT sum(ocorrencias_geradas)::int FROM public.motorista_financeiro_recorrencias'
          ),
          2
        );
      }
    );

    await scenario(
      'service role gera semanas permitidas e rejeita janela excessiva/nula/negativa',
      async () => {
        await asRole(db, 'service_role', undefined, async () => {
          for (const value of [-1, 5, 1000000000, null]) {
            await denied(db, 'SELECT public.gerar_movimentos_recorrentes($1)', [value], '22023');
            await denied(db, 'SELECT public.gerar_seguros_semanais($1)', [value], '22023');
          }
          assert.equal(await scalar(db, 'SELECT public.gerar_movimentos_recorrentes(4)'), 2);
          assert.equal(await scalar(db, 'SELECT public.gerar_seguros_semanais(4)'), 2);
        });
        assert.equal(await scalar(db, 'SELECT count(*)::int FROM public.motorista_financeiro'), 4);
      }
    );

    await scenario(
      'claim service limita lotes a dois e desconta todas as execuções já ativas',
      async () => {
        await asRole(db, 'service_role', undefined, async () => {
          for (const value of [-1, 0, null])
            assert.equal(
              (await db.query('SELECT * FROM public.via_verde_sync_queue_claim($1)', [value])).rows
                .length,
              0
            );
          assert.equal(
            (await db.query('SELECT * FROM public.via_verde_sync_queue_claim(1)')).rows.length,
            1
          );
          assert.equal(
            (await db.query('SELECT * FROM public.via_verde_sync_queue_claim(-2147483648)')).rows
              .length,
            0
          );
          assert.equal(
            (await db.query('SELECT * FROM public.via_verde_sync_queue_claim(2147483647)')).rows
              .length,
            1
          );
          assert.equal(
            (await db.query('SELECT * FROM public.via_verde_sync_queue_claim(2)')).rows.length,
            0
          );
        });
        assert.equal(
          await scalar(
            db,
            "SELECT count(*)::int FROM public.via_verde_sync_queue WHERE status = 'running'"
          ),
          2
        );
        assert.equal(
          await scalar(
            db,
            "SELECT count(DISTINCT org_id)::int FROM public.via_verde_sync_queue WHERE status = 'running'"
          ),
          2
        );
      }
    );

    await scenario('claim recupera timeouts e mantém máximo dois robots globais', async () => {
      await db.exec(
        "UPDATE public.via_verde_sync_queue SET status = 'running', started_at = now() - interval '16 minutes' WHERE id IN (SELECT id FROM public.via_verde_sync_queue ORDER BY created_at LIMIT 1);"
      );
      await asRole(db, 'service_role', undefined, async () => {
        assert.equal(
          (await db.query('SELECT * FROM public.via_verde_sync_queue_claim(500)')).rows.length,
          2
        );
      });
      assert.equal(
        await scalar(
          db,
          "SELECT count(*)::int FROM public.via_verde_sync_queue WHERE status = 'failed'"
        ),
        1
      );
      assert.equal(
        await scalar(
          db,
          "SELECT count(*)::int FROM public.via_verde_sync_queue WHERE status = 'running'"
        ),
        2
      );
    });

    // O drain passou a exigir chamada interna: o pedido manual do ecrã de
    // integrações põe na fila e arranca o drain pelo servidor.
    const pedirSql = 'SELECT public.via_verde_sync_pedir($1, $2, $3) AS r';
    const arranques = () =>
      scalar(
        db,
        "SELECT count(*)::int FROM public.cron_http_log WHERE jobname = 'via-verde-sync-manual'"
      );
    const pendentesDe = (integracao) =>
      scalar(
        db,
        `SELECT count(*)::int FROM public.via_verde_sync_queue WHERE integracao_id = '${integracao}' AND status = 'pending'`
      );

    await scenario(
      'pedido manual Via Verde: anon, não-admin, outra org e outra plataforma são recusados',
      async () => {
        await asRole(db, 'anon', undefined, () => denied(db, pedirSql, [id.viaVerdeA, null, null]));
        await asRole(db, 'authenticated', id.readerA, () =>
          denied(db, pedirSql, [id.viaVerdeA, null, null])
        );
        await asRole(db, 'authenticated', id.adminA, async () => {
          await denied(db, pedirSql, [id.viaVerdeB, null, null]);
          await denied(db, pedirSql, [id.boltA, null, null], '22023');
        });
        assert.equal(await pendentesDe(id.viaVerdeA), 0);
        assert.equal(await pendentesDe(id.viaVerdeB), 0);
        assert.equal(await arranques(), 0);
      }
    );

    await scenario(
      'pedido manual Via Verde: admin põe na fila e arranca o drain uma vez',
      async () => {
        await asRole(db, 'authenticated', id.adminA, async () => {
          const primeiro = await db.query(pedirSql, [id.viaVerdeA, '2026-09-01', '2026-09-07']);
          assert.equal(primeiro.rows[0].r, 'adicionado');
          const segundo = await db.query(pedirSql, [id.viaVerdeA, null, null]);
          assert.equal(segundo.rows[0].r, 'ja_na_fila');
        });
        assert.equal(await pendentesDe(id.viaVerdeA), 1);
        assert.equal(
          await scalar(
            db,
            `SELECT periodo_inicio::text FROM public.via_verde_sync_queue WHERE integracao_id = '${id.viaVerdeA}'`
          ),
          '2026-09-01'
        );
        assert.equal(await arranques(), 1);
      }
    );
  } finally {
    await db.close();
  }
});
