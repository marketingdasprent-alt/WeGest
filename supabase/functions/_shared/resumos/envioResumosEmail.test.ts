import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  dataPt,
  enviarResumos,
  lerPedidoEnvio,
  MAX_MOTORISTAS_POR_PEDIDO,
  type LinhaResumo,
} from './envioResumosEmail.ts';
import { resumoSemanalTemplate } from '../email/templates/resumoSemanal.ts';

const ID1 = '00000000-0000-0000-0000-000000000001';
const ID2 = '00000000-0000-0000-0000-000000000002';
const ID3 = '00000000-0000-0000-0000-000000000003';

const linha = (motoristaId: string, email: string | null): LinhaResumo => ({
  motoristaId,
  orgId: 'org',
  nome: `M ${motoristaId.slice(-1)}`,
  email,
  liquido: 100,
  semanaFim: '2026-11-08',
});

Deno.test('lerPedidoEnvio aceita ids e semana válidos e tira repetidos', () => {
  const p = lerPedidoEnvio({ motoristaIds: [ID1, ID1, ID2], semanaInicio: '2026-11-02' });
  assertEquals(p, { motoristaIds: [ID1, ID2], semanaInicio: '2026-11-02' });
});

Deno.test(
  'lerPedidoEnvio recusa pedido vazio, ids inválidos, semana inválida e lista grande',
  () => {
    assertThrows(() => lerPedidoEnvio({}));
    assertThrows(() => lerPedidoEnvio({ motoristaIds: ['x'], semanaInicio: '2026-11-02' }));
    assertThrows(() => lerPedidoEnvio({ motoristaIds: [ID1], semanaInicio: '02/11/2026' }));
    const muitos = Array.from({ length: MAX_MOTORISTAS_POR_PEDIDO + 1 }, () => ID1);
    assertThrows(() => lerPedidoEnvio({ motoristaIds: muitos, semanaInicio: '2026-11-02' }));
  }
);

Deno.test('enviarResumos: separa sem e-mail, falhas e marca só quem recebeu', async () => {
  const marcados: string[][] = [];
  const r = await enviarResumos(
    [linha(ID1, 'a@x.pt'), linha(ID2, 'invalido'), linha(ID3, 'c@x.pt')],
    {
      enviarEmail: async (l) =>
        l.motoristaId === ID3 ? { success: false, error: 'Brevo 400' } : { success: true },
      marcarEnviados: async (ids) => {
        marcados.push(ids);
      },
    }
  );
  assertEquals(r.enviados, 1);
  assertEquals(
    r.semEmail.map((f) => f.motoristaId),
    [ID2]
  );
  assertEquals(r.falhados, [{ motoristaId: ID3, nome: 'M 3', motivo: 'Brevo 400' }]);
  assertEquals(marcados, [[ID1]]);
});

Deno.test('enviarResumos: excepção no envio conta como falha e não marca ninguém', async () => {
  let marcou = false;
  const r = await enviarResumos([linha(ID1, 'a@x.pt')], {
    enviarEmail: () => Promise.reject(new Error('rede')),
    marcarEnviados: async () => {
      marcou = true;
    },
  });
  assertEquals(r.falhados[0].motivo, 'rede');
  assertEquals(marcou, false);
});

Deno.test('template escapa o nome e mostra o período', () => {
  const { subject, html } = resumoSemanalTemplate({
    motoristaNome: '<b>Ana</b>',
    inicioFmt: dataPt('2026-11-02'),
    fimFmt: dataPt('2026-11-08'),
    liquido: 420.5,
  });
  assertEquals(subject, 'Resumo semanal 02/11/2026 a 08/11/2026');
  assertEquals(html.includes('<b>Ana</b>'), false);
  assertEquals(html.includes('&lt;b&gt;Ana&lt;/b&gt;'), true);
});
