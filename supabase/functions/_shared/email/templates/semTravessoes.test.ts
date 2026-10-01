import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { alertasExpiracoesTemplate } from './alertasExpiracoes.ts';
import { assinaturaConcluidaTemplate } from './assinaturaConcluida.ts';
import { assinaturaPedidoTemplate } from './assinaturaPedido.ts';
import { calendarNotificationTemplate } from './calendarNotification.ts';
import { candidaturaPendenteTemplate } from './candidatura.ts';
import { contactInquiryTemplate } from './contactInquiry.ts';
import { contratoTemplate } from './contrato.ts';
import { documentoViaturaTemplate } from './documentoViatura.ts';
import {
  eliminacaoContaAdminTemplate,
  eliminacaoContaConfirmacaoTemplate,
} from './eliminacaoConta.ts';
import { fichaIncompletaTemplate } from './fichaIncompleta.ts';
import { cobrancaAtrasoTemplate } from './financeiro.ts';
import { reminderTemplate } from './reminder.ts';
import { reparacaoAbertaDemoradaTemplate, reparacaoConcluidaTemplate } from './reparacao.ts';
import { reservaSemCheckinTemplate } from './reservaSemCheckin.ts';

// O dono do produto não quer travessões nos emails. O hífen dentro de uma
// palavra ou matrícula (AA-00-BB) não conta; " - " como separador conta.
function assertSemTravessoes(texto: string, onde: string) {
  assert(!/[–—]/.test(texto), `${onde} tem travessão: ${texto}`);
  assert(!/ - /.test(texto), `${onde} tem " - " a separar: ${texto}`);
}

const viatura = { matricula: 'AA-00-BB', marcaModelo: 'Toyota Corolla' };

Deno.test('assuntos sem travessões', () => {
  const casos: Array<[string, string]> = [
    [
      alertasExpiracoesTemplate({
        orgNome: 'Org',
        today: new Date(2026, 9, 1),
        extintores: [],
        contratos: [],
      }).subject,
      '⚠️ Alertas de Renovação: 01/10/2026',
    ],
    [
      assinaturaConcluidaTemplate({
        destinatarioNome: 'Ana',
        documentoNome: 'Contrato 12',
        signatarioNome: 'Rui',
        assinadoEm: '01/10/2026',
      }).subject,
      'Documento assinado: Contrato 12',
    ],
    [
      assinaturaPedidoTemplate({
        destinatarioNome: 'Ana',
        documentoNome: 'Contrato 12',
        ctaUrl: 'https://x',
      }).subject,
      'Documento para assinar: Contrato 12',
    ],
    [
      calendarNotificationTemplate({
        matricula: 'AA00BB',
        cidade: 'Lisboa',
        tipo: 'entrega',
        dataInicio: '2026-10-01T10:00:00Z',
      }).subject,
      'Novo evento: Entrega, AA-00-BB LISBOA',
    ],
    [candidaturaPendenteTemplate({ candidatoNome: 'Rui' }).subject, '👤 Nova candidatura: Rui'],
    [
      contactInquiryTemplate({
        nome: 'Rui',
        email: 'r@x.pt',
        empresa: null,
        mensagem: null,
        viaturas: null,
      }).subject,
      'Novo pedido de contacto: Rui',
    ],
    [
      contratoTemplate({ tipo: 'criado', destinatarioNome: 'Ana', ...viatura }).subject,
      'O seu contrato de aluguer: AA-00-BB',
    ],
    [
      contratoTemplate({ tipo: 'renovacao', destinatarioNome: 'Ana', ...viatura }).subject,
      'Contrato renovado: AA-00-BB',
    ],
    [
      documentoViaturaTemplate({
        tipo: 'seguro',
        ...viatura,
        dataValidadeFmt: '01/10/2026',
        diasRestantes: 20,
      }).subject,
      '📋 Seguro Automóvel a expirar: AA-00-BB',
    ],
    [
      eliminacaoContaAdminTemplate({ email: 'a@x.pt', requestedAt: 'hoje', adminEmail: 'b@x.pt' })
        .subject,
      'Pedido de Eliminação de Conta na WeGest',
    ],
    [
      eliminacaoContaConfirmacaoTemplate({
        email: 'a@x.pt',
        requestedAt: 'hoje',
        adminEmail: 'b@x.pt',
      }).subject,
      'Confirmação do Pedido de Eliminação de Conta na WeGest',
    ],
    [
      fichaIncompletaTemplate({ destinatarioNome: 'Ana', camposEmFalta: ['NIF'] }).subject,
      'Lembrete: complete a sua ficha',
    ],
    [
      cobrancaAtrasoTemplate({
        destinatarioNome: 'Ana',
        numeroFatura: 'FT 1/2',
        valorTotal: 10,
        diasAtraso: 5,
      }).subject,
      '⚠️ Pagamento em atraso (5 dias): fatura FT 1/2',
    ],
    [
      reparacaoConcluidaTemplate({
        destinatarioNome: 'Ana',
        ...viatura,
        descricaoReparacao: 'Pára-choques',
        valorACobrar: 100,
      }).subject,
      'Reparação concluída: AA-00-BB (valor a cobrar)',
    ],
    [
      reparacaoAbertaDemoradaTemplate({ ...viatura, descricaoReparacao: 'Motor', diasAberta: 30 })
        .subject,
      '⚠️ Reparação parada há 30 dias: AA-00-BB',
    ],
    [
      reservaSemCheckinTemplate({ ...viatura, dataHoraPrevistaFmt: '01/10/2026 10:00' }).subject,
      '⚠️ Reserva sem check-in: AA-00-BB',
    ],
  ];

  for (const [subject, esperado] of casos) {
    assertEquals(subject, esperado);
    assertSemTravessoes(subject, 'assunto');
  }
});

Deno.test('lembrete: assunto e título sem travessões', () => {
  const base = {
    titulo: 'AA00BB',
    tipo: 'recolha',
    cidade: 'Porto',
    dataInicio: '2026-10-01T10:00:00Z',
  };
  const vespera = reminderTemplate({ ...base, variant: 'vespera' });
  const dia = reminderTemplate({ ...base, variant: 'dia' });

  assertEquals(vespera.subject, '📅 Amanhã: Recolha, AA-00-BB PORTO');
  assertEquals(dia.subject, '📅 Hoje: Recolha, AA-00-BB PORTO');
  assertStringIncludes(vespera.html, '🔔 Lembrete para amanhã');
  assertStringIncludes(dia.html, '🔔 Lembrete para hoje');
  assertSemTravessoes(vespera.html, 'lembrete');
  assertSemTravessoes(dia.html, 'lembrete');
});

Deno.test('viatura no corpo junta matrícula e modelo com vírgula', () => {
  const corpos = [
    contratoTemplate({ tipo: 'criado', destinatarioNome: 'Ana', ...viatura }).html,
    documentoViaturaTemplate({
      tipo: 'ipo',
      ...viatura,
      dataValidadeFmt: '01/10/2026',
      diasRestantes: -2,
    }).html,
    reparacaoConcluidaTemplate({
      destinatarioNome: 'Ana',
      ...viatura,
      descricaoReparacao: 'X',
      valorACobrar: 1,
    }).html,
    reparacaoAbertaDemoradaTemplate({ ...viatura, descricaoReparacao: 'X', diasAberta: 30 }).html,
    reservaSemCheckinTemplate({ ...viatura, dataHoraPrevistaFmt: '01/10/2026 10:00' }).html,
  ];
  for (const html of corpos) {
    assertStringIncludes(html, '<strong>Viatura:</strong> AA-00-BB, Toyota Corolla</p>');
    assert(!/[–—]/.test(html), 'sem travessões no email');
  }
});

Deno.test('calendário, contacto e alertas: corpo sem travessões', () => {
  const calendario = calendarNotificationTemplate({
    matricula: 'AA00BB',
    cidade: 'Lisboa',
    tipo: 'troca',
    dataInicio: '2026-10-01T10:00:00Z',
  }).html;
  assertStringIncludes(calendario, '>AA-00-BB, LISBOA</h2>');
  assertSemTravessoes(calendario, 'calendário');

  const contacto = contactInquiryTemplate({
    nome: 'Rui',
    email: 'r@x.pt',
    empresa: null,
    mensagem: null,
    viaturas: null,
  }).html;
  assertStringIncludes(contacto, 'Sem mensagem: pedido de contacto direto.');
  assertSemTravessoes(contacto, 'contacto');

  const alertas = alertasExpiracoesTemplate({
    orgNome: 'Org',
    today: new Date(2026, 9, 1),
    extintores: [],
    contratos: [],
  }).html;
  assertStringIncludes(alertas, 'Org, 01/10/2026</p>');
  assertStringIncludes(alertas, 'Email automático de Org CRM. Não responda a esta mensagem.');
  assertSemTravessoes(alertas, 'alertas');
});
