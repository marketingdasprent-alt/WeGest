// Especificação OpenAPI 3.1 da API externa de rent-a-car (Fase A: catálogo).
// Fonte única: o endpoint /v1/openapi.json e o site docs.wegest.pt saem daqui.
// Os esquemas seguem exactamente as chaves devolvidas pelas funções SQL api_*.
// Em 3.1 não existe `nullable`: um campo opcional é `type: [X, 'null']`.
// x-permissao por operação: 'publica' (sem chave), 'chave' (qualquer chave
// válida desta API) ou a permissão exigida (ex.: 'catalogo:read').
import {
  EX_APRESENTACAO,
  EX_CATEGORIA,
  EX_COBERTURA,
  EX_EXTRA,
  EX_HEALTH,
  EX_LOCALIZACAO,
  EX_MODELO,
  EX_MODELO_DETALHE,
  EX_PRECO,
  exErro,
} from './openapi.exemplos.ts';

type Esquema = Record<string, unknown>;

export const PERMISSOES_ESPECIAIS = ['publica', 'chave'] as const;

const nulavel = (s: Esquema): Esquema => ({ ...s, type: [s.type as string, 'null'] });
const texto = (description?: string): Esquema => ({ type: 'string', description });
const textoOuNulo = (description?: string): Esquema => nulavel(texto(description));
const inteiroOuNulo = (description?: string): Esquema => nulavel({ type: 'integer', description });
const uuid = (description?: string): Esquema => ({ type: 'string', format: 'uuid', description });

const Preco: Esquema = {
  type: 'object',
  description: 'Euros com 2 casas; iva em percentagem.',
  required: ['sem_iva', 'com_iva', 'iva'],
  properties: {
    sem_iva: { type: 'number', description: 'Valor sem IVA.' },
    com_iva: { type: 'number', description: 'Valor com IVA.' },
    iva: { type: 'number', description: 'Taxa de IVA em percentagem.' },
  },
  example: EX_PRECO,
};

const Localizacao: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    nome: texto('Nome da estação.'),
    morada: textoOuNulo(),
    cidade: textoOuNulo(),
    horario: textoOuNulo('Horário de atendimento, em texto livre.'),
    latitude: nulavel({ type: 'number' }),
    longitude: nulavel({ type: 'number' }),
  },
  example: EX_LOCALIZACAO,
};

const Categoria: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    codigo: texto('Código interno da categoria.'),
    nome: texto(),
    descricao: textoOuNulo(),
    codigo_sipp: textoOuNulo('Código ACRISS/SIPP de 4 letras.'),
    imagem_url: textoOuNulo(),
    combustivel: textoOuNulo(),
    idade_minima_condutor: inteiroOuNulo('Idade mínima do condutor, em anos.'),
    idade_maxima_condutor: inteiroOuNulo('Idade máxima do condutor, em anos.'),
    preco_dia_desde: nulavel({ ...Preco, description: 'Preço por dia mais baixo da categoria.' }),
    modelos: { type: 'integer', description: 'Modelos publicáveis nesta categoria.' },
  },
  example: EX_CATEGORIA,
};

const Modelo: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    marca: texto(),
    modelo: texto('Mostrado como "<modelo> ou similar".'),
    categoria: nulavel({ type: 'object', properties: { id: uuid(), nome: texto() } }),
    tipo: { type: 'string', enum: ['passageiros', 'comercial'] },
    caixa: { type: 'string', enum: ['manual', 'automatica'] },
    combustivel: textoOuNulo(),
    lugares: { type: 'integer' },
    portas: inteiroOuNulo(),
    bagageira: inteiroOuNulo('Malas grandes que cabem na bagageira.'),
    ar_condicionado: { type: 'boolean' },
    imagem_url: textoOuNulo('Foto de marketing do modelo.'),
    preco_dia: { ...Preco, description: 'Preço por dia na tarifa do site.' },
    frota: { type: 'integer', description: 'Viaturas deste modelo na frota de aluguer.' },
  },
  example: EX_MODELO,
};

const Cobertura: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    nome: texto(),
    descricao: textoOuNulo(),
    preco_dia: Preco,
    franquia: nulavel({
      ...Preco,
      description: 'Franquia com esta cobertura; null = sem franquia.',
    }),
  },
  example: EX_COBERTURA,
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
            km_incluidos: inteiroOuNulo('Quilómetros incluídos por dia; null = ilimitados.'),
            km_adicional: nulavel({ ...Preco, description: 'Preço por quilómetro a mais.' }),
            franquia: nulavel(Preco),
            caucao: nulavel(Preco),
          },
        },
        coberturas: { type: 'array', items: { $ref: '#/components/schemas/Cobertura' } },
      },
    },
  ],
  example: EX_MODELO_DETALHE,
};

const Extra: Esquema = {
  type: 'object',
  properties: {
    id: uuid(),
    nome: texto(),
    descricao: textoOuNulo(),
    preco: Preco,
    tipo_calculo: {
      type: 'string',
      enum: ['fixo', 'dia'],
      description: 'fixo = uma vez por aluguer; dia = por cada dia.',
    },
    quantidade_maxima: inteiroOuNulo(),
  },
  example: EX_EXTRA,
};

const Erro: Esquema = {
  type: 'object',
  required: ['erro'],
  properties: {
    erro: {
      type: 'object',
      required: ['codigo', 'mensagem'],
      properties: {
        codigo: texto('Código estável, para o seu código decidir.'),
        mensagem: texto('Texto em português, para registo; não mostrar ao cliente final.'),
        detalhes: { description: 'Opcional; depende do código.' },
      },
    },
  },
  example: exErro('NAO_AUTENTICADO', 'Chave de API desconhecida.'),
};

const refErro = (nome: string) => ({ $ref: `#/components/responses/${nome}` });

const respostaErro = (descricao: string, codigo: string, mensagem: string): Esquema => ({
  description: descricao,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Erro' },
      example: exErro(codigo, mensagem),
    },
  },
});

/** Erros de qualquer operação com chave. */
const ERROS_COM_CHAVE = {
  '401': refErro('NaoAutenticado'),
  '403': refErro('SemPermissao'),
  '429': refErro('LimiteExcedido'),
  '503': refErro('Indisponivel'),
};

/** Erros das operações de catálogo (as RPCs podem falhar com 500). */
const ERROS_CATALOGO = { ...ERROS_COM_CHAVE, '500': refErro('ErroInterno') };

const json = (schema: Esquema, example: unknown) => ({
  'application/json': { schema, example },
});

const respostaLista = (ref: string, descricao: string, exemplo: unknown): Esquema => ({
  '200': {
    description: descricao,
    content: json({ type: 'array', items: { $ref: ref } }, [exemplo]),
  },
  ...ERROS_CATALOGO,
});

const LER_CATALOGO = 'catalogo:read';

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
      'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1 (servidor "directo"); ' +
      'via api.wegest.pt o pedido passa pelo Cloudflare e o IP visto não é o do seu servidor. ' +
      'No "experimentar" da documentação use só uma chave de teste.',
  },
  servers: [
    { url: 'https://api.wegest.pt/v1' },
    {
      url: 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1',
      description: 'directo',
    },
  ],
  security: [{ ApiKey: [] }],
  tags: [
    { name: 'API' },
    { name: 'Localizações' },
    { name: 'Categorias' },
    { name: 'Modelos' },
    { name: 'Extras' },
    { name: 'Coberturas' },
  ],
  paths: {
    '/': {
      get: {
        summary: 'Apresentação da API',
        tags: ['API'],
        security: [],
        'x-permissao': 'publica',
        responses: {
          '200': {
            description: 'Nome, versão e onde está a documentação',
            content: json(
              {
                type: 'object',
                properties: { nome: texto(), versao: texto(), documentacao: texto() },
              },
              EX_APRESENTACAO
            ),
          },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Estado da API e da chave',
        description: 'Confirma que a chave autentica e se a organização tem tarifa do site.',
        tags: ['API'],
        'x-permissao': 'chave',
        responses: {
          '200': {
            description: 'A chave é válida',
            content: json(
              {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                  organizacao: uuid('Organização dona da chave.'),
                  permissoes: { type: 'array', items: texto() },
                  tarifa_site: {
                    type: 'boolean',
                    description: 'false quando a organização não tem tarifa do site activa.',
                  },
                },
              },
              EX_HEALTH
            ),
          },
          ...ERROS_COM_CHAVE,
        },
      },
    },
    '/openapi.json': {
      get: {
        summary: 'Esta especificação',
        tags: ['API'],
        security: [],
        'x-permissao': 'publica',
        responses: {
          '200': {
            description: 'Documento OpenAPI 3.1',
            content: json(
              { type: 'object' },
              { openapi: '3.1.0', info: { title: EX_APRESENTACAO.nome, version: '1.0.0' } }
            ),
          },
        },
      },
    },
    '/localizacoes': {
      get: {
        summary: 'Estações activas',
        tags: ['Localizações'],
        'x-permissao': LER_CATALOGO,
        responses: respostaLista(
          '#/components/schemas/Localizacao',
          'Lista de localizações',
          EX_LOCALIZACAO
        ),
      },
    },
    '/categorias': {
      get: {
        summary: 'Categorias com modelos publicáveis',
        tags: ['Categorias'],
        'x-permissao': LER_CATALOGO,
        responses: respostaLista(
          '#/components/schemas/Categoria',
          'Lista de categorias',
          EX_CATEGORIA
        ),
      },
    },
    '/modelos': {
      get: {
        summary: 'Modelos publicáveis ("Clio ou similar")',
        tags: ['Modelos'],
        'x-permissao': LER_CATALOGO,
        parameters: [
          {
            name: 'categoria',
            in: 'query',
            description: 'Só os modelos desta categoria (id de /categorias).',
            schema: uuid(),
            example: EX_CATEGORIA.id,
          },
          {
            name: 'tipo',
            in: 'query',
            description: 'Só passageiros ou só comerciais.',
            schema: { type: 'string', enum: ['passageiros', 'comercial'] },
            example: 'passageiros',
          },
        ],
        responses: {
          ...respostaLista('#/components/schemas/Modelo', 'Lista de modelos', EX_MODELO),
          '400': refErro('ParametroInvalido'),
        },
      },
    },
    '/modelos/{id}': {
      get: {
        summary: 'Detalhe do modelo com tarifa e coberturas',
        tags: ['Modelos'],
        'x-permissao': LER_CATALOGO,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Id do modelo (de /modelos).',
            schema: uuid(),
            example: EX_MODELO.id,
          },
        ],
        responses: {
          '200': {
            description: 'Modelo',
            content: json({ $ref: '#/components/schemas/ModeloDetalhe' }, EX_MODELO_DETALHE),
          },
          '404': refErro('NaoEncontrado'),
          ...ERROS_CATALOGO,
        },
      },
    },
    '/extras': {
      get: {
        summary: 'Extras activos',
        tags: ['Extras'],
        'x-permissao': LER_CATALOGO,
        responses: respostaLista('#/components/schemas/Extra', 'Lista de extras', EX_EXTRA),
      },
    },
    '/coberturas': {
      get: {
        summary: 'Coberturas de seguro activas',
        tags: ['Coberturas'],
        'x-permissao': LER_CATALOGO,
        responses: respostaLista(
          '#/components/schemas/Cobertura',
          'Lista de coberturas',
          EX_COBERTURA
        ),
      },
    },
  },
  components: {
    securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
    schemas: { Preco, Localizacao, Categoria, Modelo, ModeloDetalhe, Extra, Cobertura, Erro },
    responses: {
      NaoAutenticado: respostaErro(
        'Chave em falta ou desconhecida',
        'NAO_AUTENTICADO',
        'Chave de API desconhecida.'
      ),
      SemPermissao: respostaErro(
        'Chave sem a permissão, desactivada, expirada ou fora da whitelist',
        'SEM_PERMISSAO',
        'A chave não tem a permissão catalogo:read.'
      ),
      NaoEncontrado: respostaErro(
        'Recurso inexistente nesta organização',
        'NAO_ENCONTRADO',
        'Modelo não encontrado.'
      ),
      ParametroInvalido: respostaErro(
        'Parâmetro de consulta inválido',
        'PARAMETRO_INVALIDO',
        'tipo tem de ser passageiros ou comercial.'
      ),
      LimiteExcedido: respostaErro(
        'Limite de pedidos por minuto excedido; ver Retry-After',
        'LIMITE_EXCEDIDO',
        'Limite de pedidos por minuto excedido.'
      ),
      ErroInterno: respostaErro(
        'Falha inesperada a ler os dados; tente de novo',
        'ERRO_INTERNO',
        'Falha a ler o catálogo.'
      ),
      Indisponivel: respostaErro(
        'Serviço temporariamente indisponível (quotas ou base); ver Retry-After',
        'ERRO_INTERNO',
        'Serviço temporariamente indisponível.'
      ),
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
