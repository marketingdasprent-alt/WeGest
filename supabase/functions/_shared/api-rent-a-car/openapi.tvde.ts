// OpenAPI das rotas TVDE (fase D1). Funções puras: recebem os esquemas e helpers de
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

const LER_TVDE = 'tvde:catalogo:read';

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
  return {
    ModeloTvde,
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
  /** Erros das leituras de catálogo (401, 403, 429, 500, 503). */
  errosCatalogo: Esquema;
  /** Erros das leituras calculadas na hora (mais 400 e 404). */
  errosPeriodo: Esquema;
}

export function caminhosTvde(a: Ajudas): Record<string, Esquema> {
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
  };
}
