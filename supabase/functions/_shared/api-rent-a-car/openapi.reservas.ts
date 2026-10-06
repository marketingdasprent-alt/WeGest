// OpenAPI das reservas (fase C). Funções puras: recebem os esquemas e helpers de
// openapi.ts, que as chama, para não haver import circular.
import {
  EX_FIM,
  EX_INICIO,
  EX_LOCALIZACAO,
  EX_LOCALIZACAO_RECOLHA_ID,
  EX_MODELO,
  EX_PERIODO,
} from './openapi.exemplos.ts';

type Esquema = Record<string, unknown>;

const EX_RESERVA_ID = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

export const EX_CLIENTE_RESERVA = {
  nome: 'Carla Nova',
  email: 'carla@exemplo.pt',
  telefone: '+351 912 345 678',
  nif: null,
  data_nascimento: '1990-05-01',
  morada: null,
  codigo_postal: null,
  localidade: null,
  pais: 'Portugal',
};
export const EX_CARTA = { numero: 'L-1234567', validade: '2030-01-01', pais: 'Portugal' };
// Só o aluguer (3 dias × 35 € = 105 € sem IVA), sem extras nem cobertura.
export const EX_RESERVA_PEDIDO = {
  modelo_id: EX_MODELO.id,
  inicio: EX_INICIO,
  fim: EX_FIM,
  entrega: EX_LOCALIZACAO.id,
  recolha: EX_LOCALIZACAO_RECOLHA_ID,
  extras: [],
  cobertura_id: null,
  cliente: EX_CLIENTE_RESERVA,
  carta_conducao: EX_CARTA,
  total_esperado: 129.15,
  referencia_externa: 'site-2026-000123',
  mensagem: 'Chego no voo TP1234 às 9h40.',
};
export const EX_RESERVA = {
  id: EX_RESERVA_ID,
  codigo: 1042,
  estado: 'pendente',
  referencia_externa: 'site-2026-000123',
  periodo: EX_PERIODO,
  modelo: { id: EX_MODELO.id, marca: EX_MODELO.marca, modelo: EX_MODELO.modelo },
  estacoes: {
    entrega: { id: EX_LOCALIZACAO.id, nome: EX_LOCALIZACAO.nome },
    recolha: { id: EX_LOCALIZACAO_RECOLHA_ID, nome: 'Porto' },
  },
  total: { sem_iva: 105, com_iva: 129.15, iva: 23 },
  criada_em: '2026-10-03T14:05:00Z',
};

const texto = (description: string, extra: Esquema = {}): Esquema => ({
  type: 'string',
  description,
  ...extra,
});
const textoOuNulo = (description: string, maxLength: number): Esquema => ({
  type: ['string', 'null'],
  description,
  maxLength,
});
const data = (description: string): Esquema => ({ type: 'string', format: 'date', description });

export function esquemasReservas(base: { CotacaoPedido: Esquema }): Record<string, Esquema> {
  const cot = base.CotacaoPedido as { required: string[]; properties: Record<string, Esquema> };
  return {
    ClienteReserva: {
      type: 'object',
      required: ['nome', 'email', 'telefone', 'data_nascimento', 'pais'],
      description:
        'Procura-se pelo NIF e, sem NIF, pelo email. Um cliente que já existe nunca é alterado.',
      properties: {
        nome: texto('Nome completo.', { maxLength: 200 }),
        email: texto('Email do cliente.', { format: 'email', maxLength: 254 }),
        telefone: texto('Com ou sem indicativo.', { maxLength: 20 }),
        nif: textoOuNulo('NIF português (9 dígitos). Clientes estrangeiros omitem-no.', 9),
        data_nascimento: data('AAAA-MM-DD, no passado, de 1900-01-01 em diante.'),
        morada: textoOuNulo('Morada.', 200),
        codigo_postal: textoOuNulo('Código postal.', 20),
        localidade: textoOuNulo('Localidade.', 100),
        pais: texto('País de residência.', { maxLength: 60 }),
      },
      example: EX_CLIENTE_RESERVA,
    },
    CartaConducao: {
      type: 'object',
      required: ['numero', 'validade', 'pais'],
      properties: {
        numero: texto('Número da carta.', { maxLength: 40 }),
        validade: data('AAAA-MM-DD; tem de valer até ao fim do aluguer.'),
        pais: texto('País emissor.', { maxLength: 60 }),
      },
      example: EX_CARTA,
    },
    ReservaPedido: {
      type: 'object',
      required: [
        ...cot.required,
        'cliente',
        'carta_conducao',
        'total_esperado',
        'referencia_externa',
      ],
      properties: {
        ...cot.properties,
        cliente: { $ref: '#/components/schemas/ClienteReserva' },
        carta_conducao: { $ref: '#/components/schemas/CartaConducao' },
        total_esperado: {
          type: 'number',
          description:
            'O subtotal.com_iva da cotação que o cliente viu. Se o preço mudou, a resposta é ' +
            '409 PRECO_ALTERADO com a cotação nova em erro.detalhes.',
        },
        referencia_externa: texto(
          'Id da reserva no site. Repetir o pedido com a mesma referência devolve a reserva já ' +
            'criada (200), nunca uma segunda.',
          { pattern: '^[A-Za-z0-9._:-]{1,100}$' }
        ),
        mensagem: textoOuNulo('Nota do cliente para a equipa (voo, hora de chegada).', 1000),
      },
      example: EX_RESERVA_PEDIDO,
    },
    Reserva: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        codigo: {
          type: 'integer',
          description: 'Número da reserva no WeGest; usado em /reservas/{codigo}.',
        },
        estado: {
          type: 'string',
          enum: ['pendente', 'confirmada', 'em_curso', 'concluida', 'cancelada', 'expirada'],
          description: 'Entra como pendente; a equipa confirma no WeGest.',
        },
        referencia_externa: { type: ['string', 'null'] },
        periodo: { $ref: '#/components/schemas/Periodo' },
        modelo: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            marca: { type: 'string' },
            modelo: { type: 'string' },
          },
        },
        estacoes: { type: 'object', description: 'Entrega e recolha, cada uma { id, nome }.' },
        total: { $ref: '#/components/schemas/Preco' },
        criada_em: { type: 'string', format: 'date-time' },
      },
      example: EX_RESERVA,
    },
  };
}

interface Ajudas {
  json: (schema: Esquema, example: unknown) => Esquema;
  respostaErro: (descricao: string, codigo: string, mensagem: string) => Esquema;
  erros: Esquema;
}

const parametroCodigo = {
  name: 'codigo',
  in: 'path',
  required: true,
  description: 'O codigo devolvido na criação.',
  schema: { type: 'integer' },
  example: 1042,
};

export function caminhosReservas(a: Ajudas): Record<string, Esquema> {
  const reserva = (descricao: string) => ({
    description: descricao,
    content: a.json({ $ref: '#/components/schemas/Reserva' }, EX_RESERVA),
  });
  return {
    '/reservas': {
      post: {
        summary: 'Criar uma reserva (entra como pendente)',
        description:
          'Revalida período, disponibilidade e preço. A viatura é atribuída pela equipa; a ' +
          'reserva fica pendente até ser confirmada no WeGest. Uma referencia_externa já usada ' +
          'devolve a reserva existente, mesmo cancelada: um pedido novo depois de cancelar precisa ' +
          'de referência nova. Sem cache. Corpo JSON até 64 KB.',
        tags: ['Reservas'],
        'x-permissao': 'reservas:write',
        requestBody: {
          required: true,
          content: a.json({ $ref: '#/components/schemas/ReservaPedido' }, EX_RESERVA_PEDIDO),
        },
        responses: {
          '201': reserva('Reserva criada'),
          '200': reserva(
            'Já existia uma reserva com esta referencia_externa: é devolvida, sem criar outra'
          ),
          '409': a.respostaErro(
            'O preço mudou (PRECO_ALTERADO, com a cotação nova em detalhes), sem viatura livre ' +
              '(SEM_DISPONIBILIDADE) ou sem preços para as datas (TARIFA_INDISPONIVEL)',
            'PRECO_ALTERADO',
            'O preço mudou desde a cotação. Confirme o novo total com o cliente.'
          ),
          '413': a.respostaErro(
            'Corpo acima de 64 KB',
            'CORPO_INVALIDO',
            'Corpo JSON inválido ou acima de 64 KB.'
          ),
          ...a.erros,
        },
      },
    },
    '/reservas/{codigo}': {
      get: {
        summary: 'Estado de uma reserva criada pelo site',
        description:
          'Só reservas criadas pela API desta organização. Serve a qualquer chave da organização ' +
          'com reservas:read, não só à que criou a reserva: uma chave só se dá ao vosso próprio ' +
          'site. Sem cache.',
        tags: ['Reservas'],
        'x-permissao': 'reservas:read',
        parameters: [parametroCodigo],
        responses: {
          '200': reserva('Estado actual e resumo'),
          ...a.erros,
        },
      },
      delete: {
        summary: 'Cancelar uma reserva pendente',
        description:
          'Só enquanto está pendente. Cancelar outra vez devolve a reserva cancelada. Depois de ' +
          'confirmada, o cancelamento é feito com a equipa. Serve a qualquer chave da organização ' +
          'com reservas:write, não só à que criou a reserva: uma chave só se dá ao vosso próprio ' +
          'site.',
        tags: ['Reservas'],
        'x-permissao': 'reservas:write',
        parameters: [parametroCodigo],
        responses: {
          '200': reserva('Reserva cancelada'),
          '409': a.respostaErro(
            'A reserva já não está pendente',
            'ESTADO_INVALIDO',
            'A reserva já foi confirmada pela equipa; o cancelamento é feito com ela.'
          ),
          ...a.erros,
        },
      },
    },
  };
}
