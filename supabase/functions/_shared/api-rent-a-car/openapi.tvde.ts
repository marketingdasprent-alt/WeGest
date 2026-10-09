// OpenAPI das rotas TVDE (fase D1: catálogo; fase D2: candidaturas). Funções puras: recebem os esquemas e helpers de
// openapi.ts, que as chama, para não haver import circular.
import { EX_FOTO_VIATURA } from './openapi.exemplos.ts';

type Esquema = Record<string, unknown>;

// IVA do TVDE (org_definicoes.iva_tvde), 6% por omissão; não é o de rent-a-car.
const precoTvde = (semIva: number) => ({
  sem_iva: semIva,
  com_iva: Math.round(semIva * 1.06 * 100) / 100,
  iva: 6,
});

export const EX_TVDE_INICIO = '2026-10-12T09:00:00+01:00';

export const EX_MODELO_TVDE = {
  id: 'a7c3e5f1-2b4d-4e6f-8a1c-3e5f7a9b1c2d',
  marca: 'Toyota',
  modelo: 'Corolla Touring Sports',
  categoria: { id: '5e7f9a1b-3c5d-4e7f-9a1b-3c5d7e9f1a2b', nome: 'Híbrido' },
  caixa: 'automatica',
  combustivel: 'hibrido',
  lugares: 5,
  portas: 5,
  bagageira: 3,
  ar_condicionado: true,
  imagem_url: EX_FOTO_VIATURA,
  preco_semana: precoTvde(230),
  caucao: precoTvde(500),
  franquia: precoTvde(1500),
  km_incluidos: 6000,
  km_adicional: precoTvde(0.1),
  frota: 6,
};

export const EX_MODELO_TVDE_DISPONIVEL = { ...EX_MODELO_TVDE, quantidade_disponivel: 2 };

export const EX_DISPONIBILIDADE_TVDE = {
  inicio: '2026-10-12T08:00:00+00:00',
  modelos: [EX_MODELO_TVDE_DISPONIVEL],
};

// NIF e IBAN de teste com o dígito de controlo certo (passam nif_pt_valido e iban_valido).
export const EX_CANDIDATURA_TVDE_NOVA = {
  referencia_externa: 'site-cand-2026-000042',
  nome: 'Rui Silva Condutor',
  email: 'rui.silva@exemplo.pt',
  telefone: '+351 912 345 678',
  nif: '258714638',
  morada: 'Rua das Flores, 10, 2.º Esq.',
  codigo_postal: '1200-192',
  cidade: 'Lisboa',
  documento: { tipo: 'cc', numero: '12345678 9 ZZ1', validade: '2031-05-20' },
  carta_conducao: { numero: 'L-1234567', categorias: ['B'], validade: '2034-03-15' },
  licenca_tvde: { numero: 'TVDE-12345/2024', validade: '2029-06-30' },
  em_formacao_tvde: false,
  iban: 'PT50000201231234567890154',
  modelo_pretendido_id: EX_MODELO_TVDE.id,
  data_inicio_pretendida: '2026-10-19',
  observacoes: 'Posso começar a uma segunda-feira.',
  consentimento: { versao: '2026-10', aceite_em: '2026-10-09T15:42:00+01:00' },
};

export const EX_CANDIDATURA_TVDE = {
  id: 'c4d5e6f7-8a9b-4c0d-9e1f-2a3b4c5d6e7f',
  estado: 'submetido',
  criada_em: '2026-10-09T14:42:03Z',
  decidida_em: null,
};

const LER_TVDE = 'tvde:catalogo:read';

const DESCRICAO_CANDIDATURA =
  'Grava a candidatura de um motorista TVDE. Entra como submetido e a equipa aprova-a no ' +
  'WeGest; a decisão consulta-se depois em GET /tvde/candidaturas/{id}. Os documentos ' +
  '(cartão de cidadão, carta, licença TVDE, registo criminal) não vão pela API: a equipa ' +
  'pede-os depois. A mesma referencia_externa, com a mesma chave, nunca cria duas ' +
  'candidaturas: repetir o pedido devolve a que já existe (200). Se a pessoa já tem uma ' +
  'candidatura em curso nesta organização (mesmo NIF ou email), a resposta é 409 ' +
  'CANDIDATURA_EXISTENTE, sem dizer qual. Limite de 50 candidaturas por dia por chave (429 ' +
  'LIMITE_EXCEDIDO com Retry-After). O formulário do site tem de ter CAPTCHA (Turnstile ou ' +
  'equivalente): sem ele qualquer robô esgota o limite. Não guarde os dados pessoais do ' +
  'formulário nos logs do site. Sem cache. Corpo JSON até 64 KB.';

const DESCRICAO_DISPONIBILIDADE =
  'O aluguer TVDE não tem fim: renova-se semana a semana. Por isso uma viatura só conta se ' +
  'estiver livre a partir de inicio sem nada marcado depois — uma reserva de rent-a-car daqui ' +
  'a três meses já a tira daqui. Descontam-se as reservas sem viatura do modelo. inicio tem de ' +
  'estar no futuro e a no máximo 180 dias (senão 400 PERIODO_INVALIDO). Sem tarifa TVDE do site ' +
  'a resposta é 503 CONFIG_EM_FALTA; com inicio fora da validade dessa tarifa, 409 ' +
  'TARIFA_INDISPONIVEL. Calculado na hora e nunca guardado em cache ' +
  '(Cache-Control: no-store, também nos erros). Só aparecem modelos com pelo menos uma viatura ' +
  'livre.';

const semChaves = (o: Esquema, ...chaves: string[]): Esquema =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !chaves.includes(k)));

export function esquemasTvde(base: { Modelo: Esquema; Preco: Esquema }): Record<string, Esquema> {
  // O cartão TVDE é o de rent-a-car sem tipo (é sempre de passageiros) e sem preco_dia.
  const comuns = semChaves(
    (base.Modelo as { properties: Esquema }).properties,
    'tipo',
    'preco_dia'
  );
  // Sem o exemplo do Preco, que está com o IVA de rent-a-car.
  const Preco = semChaves(base.Preco, 'example');
  const preco = (description: string): Esquema => ({ ...Preco, description });
  const precoOuNulo = (description: string): Esquema => ({
    ...Preco,
    type: ['object', 'null'],
    description,
  });
  const ModeloTvde: Esquema = {
    type: 'object',
    description:
      'Modelo elegível para TVDE com preço na tarifa TVDE do site. IVA do TVDE. caixa e ' +
      'lugares vêm null enquanto não estiverem preenchidos no WeGest.',
    properties: {
      ...comuns,
      caixa: { type: ['string', 'null'], enum: ['manual', 'automatica', null] },
      lugares: { type: ['integer', 'null'] },
      preco_semana: preco('Preço por semana na tarifa TVDE do site.'),
      caucao: precoOuNulo('Caução do modelo.'),
      franquia: precoOuNulo('Franquia do modelo.'),
      km_incluidos: {
        type: ['integer', 'null'],
        description: 'Quilómetros incluídos por mês; null = ilimitados.',
      },
      km_adicional: precoOuNulo('Preço por quilómetro a mais.'),
      frota: { type: 'integer', description: 'Viaturas deste modelo que podem fazer TVDE.' },
    },
    example: EX_MODELO_TVDE,
  };
  const texto = (description: string, maxLength: number, extra: Esquema = {}): Esquema => ({
    type: 'string',
    description,
    maxLength,
    ...extra,
  });
  const data = (description: string): Esquema => ({ type: 'string', format: 'date', description });
  return {
    ModeloTvde,
    CandidaturaTvdeNova: {
      type: 'object',
      required: [
        'referencia_externa',
        'nome',
        'email',
        'telefone',
        'nif',
        'morada',
        'codigo_postal',
        'cidade',
        'documento',
        'carta_conducao',
        'iban',
        'consentimento',
      ],
      description:
        'Os dados que o motorista escreveu no formulário do site, sem ficheiros. As validades ' +
        'têm de ser depois de hoje.',
      properties: {
        referencia_externa: texto(
          'Id da candidatura no site. Repetir o pedido com a mesma referência devolve a ' +
            'candidatura já criada (200), nunca uma segunda.',
          100,
          { pattern: '^[A-Za-z0-9._:-]{1,100}$' }
        ),
        nome: texto('Nome completo.', 200),
        email: texto('Email do motorista.', 254, { format: 'email' }),
        telefone: texto('Com ou sem indicativo.', 20),
        nif: texto('NIF português: 9 dígitos, com o dígito de controlo certo.', 9, {
          pattern: '^\\d{9}$',
        }),
        morada: texto('Morada.', 200),
        codigo_postal: texto('Código postal português.', 8, { pattern: '^\\d{4}-\\d{3}$' }),
        cidade: texto('Cidade ou localidade.', 100),
        documento: {
          type: 'object',
          required: ['tipo', 'numero', 'validade'],
          description: 'Documento de identificação.',
          properties: {
            tipo: {
              type: 'string',
              enum: ['cc', 'bi', 'ar', 'tr', 'passaporte'],
              description:
                'cc cartão de cidadão, bi bilhete de identidade, ar autorização de residência, ' +
                'tr título de residência, passaporte.',
            },
            numero: texto('Número do documento.', 40),
            validade: data('AAAA-MM-DD, depois de hoje.'),
          },
        },
        carta_conducao: {
          type: 'object',
          required: ['numero', 'categorias', 'validade'],
          properties: {
            numero: texto('Número da carta.', 40),
            categorias: {
              type: 'array',
              minItems: 1,
              maxItems: 16,
              items: {
                type: 'string',
                enum: ['A', 'A1', 'A2', 'AM', 'B', 'B1', 'BE', 'C', 'C1', 'CE', 'D', 'D1', 'DE'],
              },
              description: 'Categorias da carta; tem de incluir B.',
            },
            validade: data('AAAA-MM-DD, depois de hoje.'),
          },
        },
        licenca_tvde: {
          type: ['object', 'null'],
          required: ['numero', 'validade'],
          description: 'Licença de motorista TVDE. Só pode faltar com em_formacao_tvde: true.',
          properties: {
            numero: texto('Número do certificado de motorista TVDE.', 40),
            validade: data('AAAA-MM-DD, depois de hoje.'),
          },
        },
        em_formacao_tvde: {
          type: 'boolean',
          default: false,
          description: 'true quando o motorista ainda está a tirar a formação TVDE.',
        },
        iban: texto('IBAN para os pagamentos; aceita espaços.', 42),
        modelo_pretendido_id: {
          type: ['string', 'null'],
          format: 'uuid',
          description: 'Modelo que o motorista escolheu (de /tvde/modelos), se escolheu.',
        },
        data_inicio_pretendida: {
          type: ['string', 'null'],
          format: 'date',
          description: 'Quando quer começar: AAAA-MM-DD entre hoje e daqui a 180 dias.',
        },
        observacoes: {
          type: ['string', 'null'],
          maxLength: 1000,
          description: 'Nota do motorista para a equipa.',
        },
        consentimento: {
          type: 'object',
          required: ['versao', 'aceite_em'],
          description: 'O consentimento RGPD que o motorista aceitou no formulário.',
          properties: {
            versao: texto('Versão do texto de consentimento mostrado.', 50),
            aceite_em: {
              type: 'string',
              format: 'date-time',
              description: 'Quando aceitou, ISO 8601 com fuso; não pode estar no futuro.',
            },
          },
        },
      },
      example: EX_CANDIDATURA_TVDE_NOVA,
    },
    CandidaturaTvde: {
      type: 'object',
      description: 'Só o estado da candidatura, sem dados pessoais.',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Usado em /tvde/candidaturas/{id}.' },
        estado: {
          type: 'string',
          enum: ['submetido', 'em_analise', 'aprovado', 'rejeitado'],
          description: 'Entra como submetido; a equipa analisa e decide no WeGest.',
        },
        criada_em: { type: 'string', format: 'date-time' },
        decidida_em: {
          type: ['string', 'null'],
          format: 'date-time',
          description: 'Quando foi aprovada ou rejeitada; null enquanto não há decisão.',
        },
      },
      example: EX_CANDIDATURA_TVDE,
    },
    ModeloTvdeDisponivel: {
      allOf: [
        ModeloTvde,
        {
          type: 'object',
          properties: {
            quantidade_disponivel: {
              type: 'integer',
              description: 'Viaturas deste modelo livres a partir de inicio, sem fim (1 ou mais).',
            },
          },
        },
      ],
      example: EX_MODELO_TVDE_DISPONIVEL,
    },
    DisponibilidadeTvde: {
      type: 'object',
      properties: {
        inicio: { type: 'string', format: 'date-time', description: 'O inicio pedido, em UTC.' },
        modelos: {
          type: 'array',
          items: { $ref: '#/components/schemas/ModeloTvdeDisponivel' },
        },
      },
      example: EX_DISPONIBILIDADE_TVDE,
    },
  };
}

interface Ajudas {
  json: (schema: Esquema, example: unknown) => Esquema;
  respostaErro: (descricao: string, codigo: string, mensagem: string) => Esquema;
  /** Erros das leituras de catálogo (401, 403, 429, 500, 503). */
  errosCatalogo: Esquema;
  /** Erros das leituras calculadas na hora (mais 400 e 404). */
  errosPeriodo: Esquema;
  /** Erros dos pedidos com corpo ou id (400, 404, 401, 403, 429, 500, 503). */
  errosPedido: Esquema;
}

export function caminhosTvde(a: Ajudas): Record<string, Esquema> {
  const candidatura = (descricao: string) => ({
    description: descricao,
    content: a.json({ $ref: '#/components/schemas/CandidaturaTvde' }, EX_CANDIDATURA_TVDE),
  });
  return {
    '/tvde/modelos': {
      get: {
        summary: 'Modelos para aluguer semanal TVDE',
        description:
          'Modelos com viaturas que podem fazer TVDE e preço por semana na tarifa TVDE do site. ' +
          'Dinheiro com o IVA do TVDE (6% por omissão), não o de rent-a-car.',
        tags: ['TVDE'],
        'x-permissao': LER_TVDE,
        responses: {
          '200': {
            description: 'Lista de modelos TVDE',
            content: a.json({ type: 'array', items: { $ref: '#/components/schemas/ModeloTvde' } }, [
              EX_MODELO_TVDE,
            ]),
          },
          ...a.errosCatalogo,
        },
      },
    },
    '/tvde/modelos/{id}': {
      get: {
        summary: 'Detalhe de um modelo TVDE',
        tags: ['TVDE'],
        'x-permissao': LER_TVDE,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Id do modelo (de /tvde/modelos).',
            schema: { type: 'string', format: 'uuid' },
            example: EX_MODELO_TVDE.id,
          },
        ],
        responses: {
          '200': {
            description: 'Modelo TVDE',
            content: a.json({ $ref: '#/components/schemas/ModeloTvde' }, EX_MODELO_TVDE),
          },
          '404': { $ref: '#/components/responses/NaoEncontrado' },
          ...a.errosCatalogo,
        },
      },
    },
    '/tvde/disponibilidade': {
      get: {
        summary: 'Modelos TVDE livres a partir de uma data, sem fim',
        description: DESCRICAO_DISPONIBILIDADE,
        tags: ['TVDE'],
        'x-permissao': LER_TVDE,
        parameters: [
          {
            name: 'inicio',
            in: 'query',
            required: true,
            description:
              'Início do aluguer, ISO 8601 com fuso (Z ou ±HH:MM); sem fuso dá 400. No futuro e ' +
              'a no máximo 180 dias.',
            schema: { type: 'string', format: 'date-time' },
            example: EX_TVDE_INICIO,
          },
        ],
        responses: {
          '200': {
            description: 'Modelos TVDE livres a partir de inicio',
            content: a.json(
              { $ref: '#/components/schemas/DisponibilidadeTvde' },
              EX_DISPONIBILIDADE_TVDE
            ),
          },
          ...a.errosPeriodo,
        },
      },
    },
    '/tvde/candidaturas': {
      post: {
        summary: 'Enviar a candidatura de um motorista TVDE',
        description: DESCRICAO_CANDIDATURA,
        tags: ['TVDE'],
        'x-permissao': 'tvde:candidaturas:write',
        requestBody: {
          required: true,
          content: a.json(
            { $ref: '#/components/schemas/CandidaturaTvdeNova' },
            EX_CANDIDATURA_TVDE_NOVA
          ),
        },
        responses: {
          '201': candidatura('Candidatura criada, em submetido'),
          '200': candidatura(
            'Já existia uma candidatura com esta referencia_externa: é devolvida, sem criar outra'
          ),
          ...a.errosPedido,
          '400': a.respostaErro(
            'Corpo inválido: PARAMETRO_INVALIDO (campo em falta ou mal formado, NIF ou IBAN com ' +
              'o dígito de controlo errado, carta sem B, validade no passado) ou CORPO_INVALIDO ' +
              '(JSON inválido)',
            'PARAMETRO_INVALIDO',
            'carta_conducao.categorias tem de incluir B.'
          ),
          '404': a.respostaErro(
            'modelo_pretendido_id não é um modelo TVDE publicado',
            'NAO_ENCONTRADO',
            'modelo_pretendido_id não é um modelo TVDE publicado.'
          ),
          '409': a.respostaErro(
            'A pessoa já tem uma candidatura em curso nesta organização (mesmo NIF ou email)',
            'CANDIDATURA_EXISTENTE',
            'Já existe uma candidatura em curso com este NIF ou email.'
          ),
          '413': a.respostaErro(
            'Corpo acima de 64 KB',
            'CORPO_INVALIDO',
            'Corpo JSON inválido ou acima de 64 KB.'
          ),
          '429': a.respostaErro(
            'Limite de pedidos por minuto, ou de 50 candidaturas por dia por chave, excedido; ' +
              'ver Retry-After',
            'LIMITE_EXCEDIDO',
            'Limite de 50 candidaturas por dia excedido.'
          ),
        },
      },
    },
    '/tvde/candidaturas/{id}': {
      get: {
        summary: 'Estado de uma candidatura enviada pelo site',
        description:
          'Só o estado e as datas, nunca dados pessoais. Só candidaturas criadas pela API desta ' +
          'organização. Serve a qualquer chave da organização com tvde:candidaturas:read, não só ' +
          'à que a criou: uma chave só se dá ao vosso próprio site. Sem cache.',
        tags: ['TVDE'],
        'x-permissao': 'tvde:candidaturas:read',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'O id devolvido na criação.',
            schema: { type: 'string', format: 'uuid' },
            example: EX_CANDIDATURA_TVDE.id,
          },
        ],
        responses: {
          '200': candidatura('Estado actual'),
          ...a.errosPedido,
          '404': a.respostaErro(
            'Candidatura inexistente nesta organização',
            'NAO_ENCONTRADO',
            'Candidatura não encontrada.'
          ),
        },
      },
    },
  };
}
