// Especificação OpenAPI 3.1 da API externa de rent-a-car (Fase A: catálogo;
// Fase B: disponibilidade e cotação).
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

// --- Fase B: disponibilidade e cotação ---------------------------------------

const refPreco = { $ref: '#/components/schemas/Preco' };
const refPrecoOuNulo = { oneOf: [refPreco, { type: 'null' }] };

const Periodo: Esquema = {
  type: 'object',
  properties: {
    inicio: { type: 'string', format: 'date-time' },
    fim: { type: 'string', format: 'date-time' },
    dias: {
      type: 'integer',
      description:
        'Dias facturados: blocos de 24 h contados no calendário de Lisboa, arredondados para cima. ' +
        'Uma mudança de hora não acrescenta um dia.',
    },
  },
};

const ModeloDisponivel: Esquema = {
  allOf: [
    { $ref: '#/components/schemas/Modelo' },
    {
      type: 'object',
      properties: {
        quantidade_disponivel: {
          type: 'integer',
          description: 'Viaturas deste modelo livres no período (sempre ≥ 1).',
        },
        cotacao: {
          type: 'object',
          properties: {
            dias: { type: 'integer' },
            preco_dia: refPreco,
            aluguer: { ...refPreco, description: 'preco_dia × dias, sem cobertura nem extras.' },
            franquia: refPrecoOuNulo,
            caucao: refPrecoOuNulo,
            km_incluidos: inteiroOuNulo(),
          },
        },
      },
    },
  ],
};

const Disponibilidade: Esquema = {
  type: 'object',
  properties: {
    periodo: { $ref: '#/components/schemas/Periodo' },
    modelos: { type: 'array', items: { $ref: '#/components/schemas/ModeloDisponivel' } },
  },
};

const CotacaoPedido: Esquema = {
  type: 'object',
  required: ['modelo_id', 'inicio', 'fim', 'entrega', 'recolha'],
  properties: {
    modelo_id: uuid(),
    inicio: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 com fuso (Z ou ±HH:MM). Sem fuso → 400.',
    },
    fim: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 com fuso, depois do início.',
    },
    entrega: { ...uuid(), description: 'Id da localização de entrega (GET /localizacoes).' },
    recolha: {
      ...uuid(),
      description: 'Id da localização de recolha; pode ser diferente da entrega.',
    },
    extras: {
      type: 'array',
      maxItems: 20,
      description: 'Cada extra no máximo uma vez; repetir o mesmo extra_id dá 400.',
      items: {
        type: 'object',
        required: ['extra_id', 'quantidade'],
        properties: {
          extra_id: uuid(),
          quantidade: {
            type: 'integer',
            minimum: 1,
            description: 'Inteiro ≥ 1 e até à quantidade_maxima do extra.',
          },
        },
      },
    },
    cobertura_id: {
      ...nulavel(uuid()),
      description: 'Cobertura escolhida (GET /coberturas). A franquia dela substitui a do modelo.',
    },
  },
};

const LinhaCotacao: Esquema = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['aluguer', 'cobertura', 'extra'] },
    descricao: texto(),
    quantidade: {
      type: 'integer',
      description: 'Dias no aluguer e na cobertura; unidades num extra.',
    },
    preco_unitario: refPreco,
    total: refPreco,
  },
};

const Cotacao: Esquema = {
  type: 'object',
  properties: {
    periodo: { $ref: '#/components/schemas/Periodo' },
    modelo: { type: 'object', properties: { id: uuid(), marca: texto(), modelo: texto() } },
    linhas: { type: 'array', items: { $ref: '#/components/schemas/LinhaCotacao' } },
    subtotal: { ...refPreco, description: 'Soma das linhas.' },
    franquia: refPrecoOuNulo,
    caucao: refPrecoOuNulo,
    km_incluidos: inteiroOuNulo(),
    km_adicional: refPrecoOuNulo,
    quantidade_disponivel: { type: 'integer' },
  },
};

const preco = (sem_iva: number, com_iva: number) => ({ sem_iva, com_iva, iva: 23 });

const EXEMPLO_PERIODO = {
  inicio: '2026-10-20T09:00:00+00:00',
  fim: '2026-10-23T09:00:00+00:00',
  dias: 3,
};

const EXEMPLO_DISPONIBILIDADE = {
  periodo: EXEMPLO_PERIODO,
  modelos: [
    {
      id: '6f1c2a40-3b1e-4c55-9a51-0d2f6c1e8a01',
      marca: 'Renault',
      modelo: 'Clio',
      categoria: { id: '1d7e9b52-8c2a-4f3e-b0a4-5e6f7a8b9c01', nome: 'Citadino' },
      tipo: 'passageiros',
      caixa: 'manual',
      combustivel: 'gasolina',
      lugares: 5,
      portas: 5,
      bagageira: 2,
      ar_condicionado: true,
      imagem_url: null,
      preco_dia: preco(35, 43.05),
      frota: 2,
      quantidade_disponivel: 1,
      cotacao: {
        dias: 3,
        preco_dia: preco(35, 43.05),
        aluguer: preco(105, 129.15),
        franquia: preco(800, 984),
        caucao: preco(300, 369),
        km_incluidos: 3000,
      },
    },
  ],
};

const EXEMPLO_COTACAO_PEDIDO = {
  modelo_id: '6f1c2a40-3b1e-4c55-9a51-0d2f6c1e8a01',
  inicio: '2026-10-20T10:00:00+01:00',
  fim: '2026-10-23T10:00:00+01:00',
  entrega: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c01',
  recolha: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c02',
  extras: [
    { extra_id: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e01', quantidade: 2 },
    { extra_id: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e02', quantidade: 1 },
  ],
  cobertura_id: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a01',
};

const EXEMPLO_COTACAO = {
  periodo: EXEMPLO_PERIODO,
  modelo: { id: '6f1c2a40-3b1e-4c55-9a51-0d2f6c1e8a01', marca: 'Renault', modelo: 'Clio' },
  linhas: [
    {
      tipo: 'aluguer',
      descricao: 'Renault Clio ou similar',
      quantidade: 3,
      preco_unitario: preco(35, 43.05),
      total: preco(105, 129.15),
    },
    {
      tipo: 'cobertura',
      descricao: 'Premium',
      quantidade: 3,
      preco_unitario: preco(12, 14.76),
      total: preco(36, 44.28),
    },
    {
      tipo: 'extra',
      descricao: 'Cadeira bebé',
      quantidade: 2,
      preco_unitario: preco(5, 6.15),
      total: preco(30, 36.9),
    },
    {
      tipo: 'extra',
      descricao: 'Limpeza',
      quantidade: 1,
      preco_unitario: preco(20, 24.6),
      total: preco(20, 24.6),
    },
  ],
  subtotal: preco(191, 234.93),
  franquia: preco(0, 0),
  caucao: preco(300, 369),
  km_incluidos: 3000,
  km_adicional: preco(0.2, 0.25),
  quantidade_disponivel: 1,
};

const exemploErro = (codigo: string, mensagem: string) => ({
  value: { erro: { codigo, mensagem } },
});

const conflito = (exemplos: Record<string, unknown>): Esquema => ({
  description:
    'Sem preço para estas datas (TARIFA_INDISPONIVEL) ou sem viatura livre (SEM_DISPONIBILIDADE)',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/Erro' }, examples: exemplos },
  },
});

const respostasFaseB = (sucesso: Esquema, conflitos: Record<string, unknown>): Esquema => ({
  '200': sucesso,
  '400': refErro('PedidoInvalido'),
  '401': refErro('NaoAutenticado'),
  '403': refErro('SemPermissao'),
  '404': refErro('NaoEncontrado'),
  '409': conflito(conflitos),
  '429': refErro('LimiteExcedido'),
  '503': refErro('ConfigEmFalta'),
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
  paths: {
    '/': {
      get: {
        summary: 'Apresentação da API',
        security: [],
        responses: {
          '200': {
            description: 'Nome, versão e onde está a documentação',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { nome: texto(), versao: texto(), documentacao: texto() },
                },
              },
            },
          },
        },
      },
    },
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
    '/disponibilidade': {
      get: {
        summary: 'Modelos livres no período, com o preço do aluguer',
        description:
          'Calculado na hora, nunca em cache. Período no futuro, até 30 dias, com início ' +
          'dentro da validade da tarifa do site. Só aparecem modelos com pelo menos uma viatura livre.',
        'x-permissao': 'disponibilidade:read',
        parameters: [
          {
            name: 'inicio',
            in: 'query',
            required: true,
            description: 'Início do aluguer, ISO 8601 com fuso (ex.: 2026-10-20T10:00:00+01:00).',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'fim',
            in: 'query',
            required: true,
            description: 'Fim do aluguer, ISO 8601 com fuso, depois do início.',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'entrega',
            in: 'query',
            required: true,
            description: 'Id da localização de entrega (GET /localizacoes).',
            schema: uuid(),
          },
          {
            name: 'recolha',
            in: 'query',
            required: true,
            description: 'Id da localização de recolha; pode ser diferente da entrega.',
            schema: uuid(),
          },
          {
            name: 'categoria',
            in: 'query',
            description: 'Filtra por categoria (GET /categorias).',
            schema: uuid(),
          },
          {
            name: 'tipo',
            in: 'query',
            description: 'Filtra por tipo de viatura.',
            schema: { type: 'string', enum: ['passageiros', 'comercial'] },
          },
        ],
        responses: respostasFaseB(
          {
            description: 'Período e modelos livres',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Disponibilidade' },
                example: EXEMPLO_DISPONIBILIDADE,
              },
            },
          },
          {
            tarifa_indisponivel: exemploErro(
              'TARIFA_INDISPONIVEL',
              'Ainda não há preços para estas datas.'
            ),
          }
        ),
      },
    },
    '/cotacoes': {
      post: {
        summary: 'Preço de um modelo no período, com cobertura e extras',
        description:
          'Calculado na hora, nunca em cache, e sem reservar nada. As mesmas regras de período ' +
          'de /disponibilidade. Corpo até 64 KB.',
        'x-permissao': 'disponibilidade:read',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CotacaoPedido' },
              example: EXEMPLO_COTACAO_PEDIDO,
            },
          },
        },
        responses: {
          ...respostasFaseB(
            {
              description: 'Linhas da cotação e totais',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Cotacao' },
                  example: EXEMPLO_COTACAO,
                },
              },
            },
            {
              sem_disponibilidade: exemploErro(
                'SEM_DISPONIBILIDADE',
                'Sem viaturas deste modelo livres nestas datas.'
              ),
              tarifa_indisponivel: exemploErro(
                'TARIFA_INDISPONIVEL',
                'Ainda não há preços para estas datas.'
              ),
            }
          ),
          '413': respostaErro('Corpo acima de 64 KB (CORPO_INVALIDO)'),
        },
      },
    },
  },
  components: {
    securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
    schemas: {
      Preco,
      Localizacao,
      Categoria,
      Modelo,
      ModeloDetalhe,
      Extra,
      Cobertura,
      Erro,
      Periodo,
      ModeloDisponivel,
      Disponibilidade,
      CotacaoPedido,
      LinhaCotacao,
      Cotacao,
    },
    responses: {
      NaoAutenticado: respostaErro('Chave em falta ou desconhecida'),
      SemPermissao: respostaErro(
        'Chave sem a permissão, desactivada, expirada ou fora da whitelist'
      ),
      NaoEncontrado: respostaErro('Recurso inexistente nesta organização'),
      ParametroInvalido: respostaErro('Parâmetro de consulta inválido'),
      LimiteExcedido: respostaErro('Limite de pedidos por minuto excedido; ver Retry-After'),
      PedidoInvalido: respostaErro(
        'Pedido inválido: PARAMETRO_INVALIDO (data sem fuso, UUID, extra repetido ou quantidade ' +
          'fora do limite), CORPO_INVALIDO, PERIODO_INVALIDO (fim antes do início, início no ' +
          'passado) ou PERIODO_EXCEDE_MAXIMO (mais de 30 dias)'
      ),
      ConfigEmFalta: respostaErro('Tarifário do site por configurar (CONFIG_EM_FALTA)'),
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
