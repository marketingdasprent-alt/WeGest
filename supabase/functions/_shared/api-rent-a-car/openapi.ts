// Especificação OpenAPI 3.1 da API externa de rent-a-car (Fase A: catálogo;
// Fase B: disponibilidade e cotação; Fase C: reservas, em openapi.reservas.ts).
// Fonte única: o endpoint /v1/openapi.json e o site docs.wegest.pt saem daqui.
// Os esquemas seguem exactamente as chaves devolvidas pelas funções SQL api_*.
// Em 3.1 não existe `nullable`: um campo opcional é `type: [X, 'null']`.
// x-permissao por operação: 'publica' (sem chave), 'chave' (qualquer chave
// válida desta API) ou a permissão exigida (ex.: 'catalogo:read').
import {
  EX_APRESENTACAO,
  EX_CATEGORIA,
  EX_COBERTURA,
  EX_COTACAO,
  EX_COTACAO_PEDIDO,
  EX_DISPONIBILIDADE,
  EX_EXTRA,
  EX_FIM,
  EX_HEALTH,
  EX_INICIO,
  EX_LINHA_COTACAO,
  EX_LOCALIZACAO,
  EX_LOCALIZACAO_RECOLHA_ID,
  EX_MODELO,
  EX_MODELO_DETALHE,
  EX_MODELO_DISPONIVEL,
  EX_PERIODO,
  EX_PRECO,
  exErro,
} from './openapi.exemplos.ts';
import { caminhosReservas, esquemasReservas } from './openapi.reservas.ts';

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

// --- Fase B: disponibilidade e cotação ---------------------------------------

const refPreco = { $ref: '#/components/schemas/Preco' };
const precoOuNulo = (description: string): Esquema => nulavel({ ...Preco, description });
const dataHora = (description: string): Esquema => ({
  type: 'string',
  format: 'date-time',
  description,
});

const Periodo: Esquema = {
  type: 'object',
  properties: {
    inicio: dataHora('Início do aluguer, em UTC.'),
    fim: dataHora('Fim do aluguer, em UTC.'),
    dias: {
      type: 'integer',
      description:
        'Dias facturados: blocos de 24 h no calendário de Lisboa, arredondados para cima. ' +
        'Uma mudança de hora não acrescenta um dia.',
    },
  },
  example: EX_PERIODO,
};

const ModeloDisponivel: Esquema = {
  allOf: [
    Modelo,
    {
      type: 'object',
      properties: {
        quantidade_disponivel: {
          type: 'integer',
          description: 'Viaturas deste modelo livres no período (sempre 1 ou mais).',
        },
        cotacao: {
          type: 'object',
          description: 'Preço do aluguer no período, sem cobertura nem extras.',
          properties: {
            dias: { type: 'integer' },
            preco_dia: refPreco,
            aluguer: { ...Preco, description: 'preco_dia × dias.' },
            franquia: precoOuNulo('Franquia do modelo sem cobertura.'),
            caucao: precoOuNulo('Caução do modelo.'),
            km_incluidos: inteiroOuNulo('Quilómetros incluídos; null = ilimitados.'),
          },
        },
      },
    },
  ],
  example: EX_MODELO_DISPONIVEL,
};

const Disponibilidade: Esquema = {
  type: 'object',
  properties: {
    periodo: { $ref: '#/components/schemas/Periodo' },
    modelos: { type: 'array', items: { $ref: '#/components/schemas/ModeloDisponivel' } },
  },
  example: EX_DISPONIBILIDADE,
};

const CotacaoPedido: Esquema = {
  type: 'object',
  required: ['modelo_id', 'inicio', 'fim', 'entrega', 'recolha'],
  properties: {
    modelo_id: uuid('Id do modelo (de /modelos ou /disponibilidade).'),
    inicio: dataHora('ISO 8601 com fuso (Z ou ±HH:MM); sem fuso dá 400.'),
    fim: dataHora('ISO 8601 com fuso, depois do início.'),
    entrega: uuid('Id da localização de entrega (de /localizacoes).'),
    recolha: uuid('Id da localização de recolha; pode ser diferente da entrega.'),
    extras: {
      type: 'array',
      maxItems: 20,
      description: 'Até 20; cada extra uma só vez (repetir o mesmo extra_id dá 400).',
      items: {
        type: 'object',
        required: ['extra_id', 'quantidade'],
        properties: {
          extra_id: uuid('Id do extra (de /extras).'),
          quantidade: {
            type: 'integer',
            minimum: 1,
            description: 'Inteiro de 1 até à quantidade_maxima do extra.',
          },
        },
      },
    },
    cobertura_id: nulavel(
      uuid('Cobertura escolhida (de /coberturas); a franquia dela substitui a do modelo.')
    ),
  },
  example: EX_COTACAO_PEDIDO,
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
  example: EX_LINHA_COTACAO,
};

const Cotacao: Esquema = {
  type: 'object',
  properties: {
    periodo: { $ref: '#/components/schemas/Periodo' },
    modelo: { type: 'object', properties: { id: uuid(), marca: texto(), modelo: texto() } },
    linhas: { type: 'array', items: { $ref: '#/components/schemas/LinhaCotacao' } },
    subtotal: { ...Preco, description: 'Soma das linhas.' },
    franquia: precoOuNulo('Franquia da cobertura escolhida ou, sem cobertura, a do modelo.'),
    caucao: precoOuNulo('Caução do modelo.'),
    km_incluidos: inteiroOuNulo('Quilómetros incluídos; null = ilimitados.'),
    km_adicional: precoOuNulo('Preço por quilómetro a mais.'),
    quantidade_disponivel: { type: 'integer' },
  },
  example: EX_COTACAO,
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
const LER_DISPONIBILIDADE = 'disponibilidade:read';

/** Erros de disponibilidade e cotação (calculados na hora, nunca em cache). */
const ERROS_DISPONIBILIDADE = {
  '400': refErro('PedidoInvalido'),
  '404': refErro('NaoEncontrado'),
  ...ERROS_CATALOGO,
};

const DESCRICAO_PERIODO =
  'Calculado na hora e nunca guardado em cache (Cache-Control: no-store, também nos erros). ' +
  'O período tem de começar no futuro, durar no máximo 30 dias e começar dentro da validade ' +
  'da tarifa do site. Sem tarifa do site configurada a resposta é 503 CONFIG_EM_FALTA.';

const parametroData = (nome: string, description: string, example: string) => ({
  name: nome,
  in: 'query',
  required: true,
  description,
  schema: { type: 'string', format: 'date-time' },
  example,
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
  tags: [
    { name: 'API' },
    { name: 'Localizações' },
    { name: 'Categorias' },
    { name: 'Modelos' },
    { name: 'Extras' },
    { name: 'Coberturas' },
    { name: 'Disponibilidade' },
    { name: 'Cotações' },
    { name: 'Reservas' },
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
    '/disponibilidade': {
      get: {
        summary: 'Modelos livres no período, com o preço do aluguer',
        description: DESCRICAO_PERIODO + ' Só aparecem modelos com pelo menos uma viatura livre.',
        tags: ['Disponibilidade'],
        'x-permissao': LER_DISPONIBILIDADE,
        parameters: [
          parametroData(
            'inicio',
            'Início do aluguer, ISO 8601 com fuso (Z ou ±HH:MM); sem fuso dá 400.',
            EX_INICIO
          ),
          parametroData('fim', 'Fim do aluguer, ISO 8601 com fuso, depois do início.', EX_FIM),
          {
            name: 'entrega',
            in: 'query',
            required: true,
            description: 'Id da localização de entrega (de /localizacoes).',
            schema: uuid(),
            example: EX_LOCALIZACAO.id,
          },
          {
            name: 'recolha',
            in: 'query',
            required: true,
            description: 'Id da localização de recolha; pode ser diferente da entrega.',
            schema: uuid(),
            example: EX_LOCALIZACAO_RECOLHA_ID,
          },
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
          '200': {
            description: 'Período e modelos livres',
            content: json({ $ref: '#/components/schemas/Disponibilidade' }, EX_DISPONIBILIDADE),
          },
          '409': respostaErro(
            'Ainda não há preços para estas datas (TARIFA_INDISPONIVEL)',
            'TARIFA_INDISPONIVEL',
            'Ainda não há preços para estas datas.'
          ),
          ...ERROS_DISPONIBILIDADE,
        },
      },
    },
    '/cotacoes': {
      post: {
        summary: 'Preço de um modelo no período, com cobertura e extras',
        description:
          DESCRICAO_PERIODO +
          ' Não reserva nada. Corpo JSON até 64 KB. 409 TARIFA_INDISPONIVEL quando ainda ' +
          'não há preços para as datas.',
        tags: ['Cotações'],
        'x-permissao': LER_DISPONIBILIDADE,
        requestBody: {
          required: true,
          content: json({ $ref: '#/components/schemas/CotacaoPedido' }, EX_COTACAO_PEDIDO),
        },
        responses: {
          '200': {
            description: 'Linhas da cotação e totais',
            content: json({ $ref: '#/components/schemas/Cotacao' }, EX_COTACAO),
          },
          '409': respostaErro(
            'Sem viatura deste modelo livre (SEM_DISPONIBILIDADE) ou sem preços para as datas ' +
              '(TARIFA_INDISPONIVEL)',
            'SEM_DISPONIBILIDADE',
            'Sem viaturas deste modelo livres nestas datas.'
          ),
          '413': respostaErro(
            'Corpo acima de 64 KB',
            'CORPO_INVALIDO',
            'Corpo JSON inválido ou acima de 64 KB.'
          ),
          ...ERROS_DISPONIBILIDADE,
        },
      },
    },
    ...caminhosReservas({ json, respostaErro, erros: ERROS_DISPONIBILIDADE }),
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
      ...esquemasReservas({ CotacaoPedido }),
    },
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
      PedidoInvalido: respostaErro(
        'Pedido inválido: PARAMETRO_INVALIDO (data sem fuso, UUID, extra repetido ou quantidade ' +
          'fora do limite), CORPO_INVALIDO (JSON inválido), PERIODO_INVALIDO (fim antes do ' +
          'início, início no passado) ou PERIODO_EXCEDE_MAXIMO (mais de 30 dias)',
        'PARAMETRO_INVALIDO',
        'inicio e fim são datas ISO 8601 com fuso.'
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
