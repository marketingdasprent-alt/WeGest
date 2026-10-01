// Especificação OpenAPI 3.1 da API externa de rent-a-car (Fase A: catálogo).
// Os esquemas seguem exactamente as chaves devolvidas pelas funções SQL api_*.
// Em 3.1 não existe `nullable`: um campo opcional é `type: [X, 'null']`.
type Esquema = Record<string, unknown>;

const nulavel = (s: Esquema): Esquema => ({ ...s, type: [s.type as string, 'null'] });
const texto = (): Esquema => ({ type: 'string' });
const textoOuNulo = (): Esquema => nulavel(texto());
const inteiroOuNulo = (): Esquema => nulavel({ type: 'integer' });
const uuid = (): Esquema => ({ type: 'string', format: 'uuid' });

const Preco: Esquema = {
  type: 'object',
  description: 'Euros com 2 casas; iva em percentagem.',
  required: ['sem_iva', 'com_iva', 'iva'],
  properties: { sem_iva: { type: 'number' }, com_iva: { type: 'number' }, iva: { type: 'number' } },
};

const Localizacao: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    nome: texto(),
    morada: textoOuNulo(),
    cidade: textoOuNulo(),
    horario: textoOuNulo(),
    latitude: nulavel({ type: 'number' }),
    longitude: nulavel({ type: 'number' }),
  },
};

const Categoria: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    codigo: texto(),
    nome: texto(),
    descricao: textoOuNulo(),
    codigo_sipp: textoOuNulo(),
    imagem_url: textoOuNulo(),
    combustivel: textoOuNulo(),
    idade_minima_condutor: inteiroOuNulo(),
    idade_maxima_condutor: inteiroOuNulo(),
    preco_dia_desde: nulavel(Preco),
    modelos: { type: 'integer', description: 'Modelos publicáveis nesta categoria.' },
  },
};

const Modelo: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    marca: texto(),
    modelo: texto(),
    categoria: nulavel({ type: 'object', properties: { id: uuid(), nome: texto() } }),
    tipo: { type: 'string', enum: ['passageiros', 'comercial'] },
    caixa: { type: 'string', enum: ['manual', 'automatica'] },
    combustivel: textoOuNulo(),
    lugares: { type: 'integer' },
    portas: inteiroOuNulo(),
    bagageira: inteiroOuNulo(),
    ar_condicionado: { type: 'boolean' },
    imagem_url: textoOuNulo(),
    preco_dia: Preco,
    frota: { type: 'integer', description: 'Viaturas deste modelo na frota de aluguer.' },
  },
};

const Cobertura: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    nome: texto(),
    descricao: textoOuNulo(),
    preco_dia: Preco,
    franquia: nulavel(Preco),
  },
};

const ModeloDetalhe: Esquema = {
  allOf: [
    Modelo,
    {
      type: 'object',
      properties: {
        tarifa: {
          type: 'object',
          properties: {
            km_incluidos: inteiroOuNulo(),
            km_adicional: nulavel(Preco),
            franquia: nulavel(Preco),
            caucao: nulavel(Preco),
          },
        },
        coberturas: { type: 'array', items: { $ref: '#/components/schemas/Cobertura' } },
      },
    },
  ],
};

const Extra: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    nome: texto(),
    descricao: textoOuNulo(),
    preco: Preco,
    tipo_calculo: { type: 'string', enum: ['fixo', 'dia'] },
    quantidade_maxima: inteiroOuNulo(),
  },
};

const Erro: Esquema = {
  type: 'object',
  required: ['erro'],
  properties: {
    erro: {
      type: 'object',
      required: ['codigo', 'mensagem'],
      properties: { codigo: texto(), mensagem: texto(), detalhes: {} },
    },
  },
};

const refErro = (nome: string) => ({ $ref: `#/components/responses/${nome}` });

const respostaErro = (descricao: string): Esquema => ({
  description: descricao,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
});

const respostaLista = (ref: string, descricao: string): Esquema => ({
  '200': {
    description: descricao,
    content: { 'application/json': { schema: { type: 'array', items: { $ref: ref } } } },
  },
  '401': refErro('NaoAutenticado'),
  '403': refErro('SemPermissao'),
  '429': refErro('LimiteExcedido'),
});

export const OPENAPI: Record<string, unknown> = {
  openapi: '3.1.0',
  info: {
    title: 'WeGest — API Rent-a-Car',
    version: '1.0.0',
    description:
      'Catálogo, disponibilidade, cotação e reservas de rent-a-car da organização. ' +
      'Chave no cabeçalho X-API-Key, só a partir do backend do site. Datas ISO 8601 com fuso. ' +
      'Dinheiro em euros com 2 casas, sempre sem e com IVA. ' +
      'Erros sempre no envelope { "erro": { "codigo", "mensagem" } }. ' +
      'A ip_whitelist de uma chave só é fiável em chamadas directas a ' +
      'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1; via wegest.pt ' +
      'o IP visto é o da Vercel. No "experimentar" desta página use só uma chave de teste.',
  },
  servers: [{ url: 'https://wegest.pt/api/rent-a-car/v1' }],
  security: [{ ApiKey: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Estado da API e da chave',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    organizacao: uuid(),
                    permissoes: { type: 'array', items: texto() },
                    tarifa_site: {
                      type: 'boolean',
                      description: 'false quando a organização não tem tarifa do site activa.',
                    },
                  },
                },
              },
            },
          },
          '401': refErro('NaoAutenticado'),
          '403': refErro('SemPermissao'),
          '429': refErro('LimiteExcedido'),
        },
      },
    },
    '/openapi.json': {
      get: {
        summary: 'Esta especificação',
        security: [],
        responses: { '200': { description: 'Documento OpenAPI 3.1' } },
      },
    },
    '/localizacoes': {
      get: {
        summary: 'Estações activas',
        responses: respostaLista('#/components/schemas/Localizacao', 'Lista de localizações'),
      },
    },
    '/categorias': {
      get: {
        summary: 'Categorias com modelos publicáveis',
        responses: respostaLista('#/components/schemas/Categoria', 'Lista de categorias'),
      },
    },
    '/modelos': {
      get: {
        summary: 'Modelos publicáveis ("Clio ou similar")',
        parameters: [
          { name: 'categoria', in: 'query', schema: uuid() },
          {
            name: 'tipo',
            in: 'query',
            schema: { type: 'string', enum: ['passageiros', 'comercial'] },
          },
        ],
        responses: {
          ...respostaLista('#/components/schemas/Modelo', 'Lista de modelos'),
          '400': refErro('ParametroInvalido'),
        },
      },
    },
    '/modelos/{id}': {
      get: {
        summary: 'Detalhe do modelo com tarifa e coberturas',
        parameters: [{ name: 'id', in: 'path', required: true, schema: uuid() }],
        responses: {
          '200': {
            description: 'Modelo',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ModeloDetalhe' } },
            },
          },
          '401': refErro('NaoAutenticado'),
          '403': refErro('SemPermissao'),
          '404': refErro('NaoEncontrado'),
          '429': refErro('LimiteExcedido'),
        },
      },
    },
    '/extras': {
      get: {
        summary: 'Extras activos',
        responses: respostaLista('#/components/schemas/Extra', 'Lista de extras'),
      },
    },
    '/coberturas': {
      get: {
        summary: 'Coberturas de seguro activas',
        responses: respostaLista('#/components/schemas/Cobertura', 'Lista de coberturas'),
      },
    },
  },
  components: {
    securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
    schemas: { Preco, Localizacao, Categoria, Modelo, ModeloDetalhe, Extra, Cobertura, Erro },
    responses: {
      NaoAutenticado: respostaErro('Chave em falta ou desconhecida'),
      SemPermissao: respostaErro(
        'Chave sem a permissão, desactivada, expirada ou fora da whitelist'
      ),
      NaoEncontrado: respostaErro('Recurso inexistente nesta organização'),
      ParametroInvalido: respostaErro('Parâmetro de consulta inválido'),
      LimiteExcedido: respostaErro('Limite de pedidos por minuto excedido; ver Retry-After'),
    },
  },
};

/** Ex.: ['GET /health', 'GET /modelos', 'GET /modelos/{id}', …] — para os testes. */
export function caminhosDocumentados(): string[] {
  const out: string[] = [];
  for (const [caminho, ops] of Object.entries(
    OPENAPI.paths as Record<string, Record<string, unknown>>
  )) {
    for (const metodo of Object.keys(ops)) out.push(`${metodo.toUpperCase()} ${caminho}`);
  }
  return out;
}
