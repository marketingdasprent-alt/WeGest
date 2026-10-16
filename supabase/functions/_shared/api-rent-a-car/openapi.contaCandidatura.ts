// OpenAPI da candidatura TVDE da conta: rascunho, ficheiros por URL assinado e submissão.
// Funções puras, chamadas por openapi.conta.ts (que traz o token e os erros comuns).
type Esquema = Record<string, unknown>;

const EX_CANDIDATURA_ID = 'c4d5e6f7-8a9b-4c0d-9e1f-2a3b4c5d6e7f';
const EX_USER_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const EX_FICHEIRO_ID = '0b7e3c1a-5d2f-4a8b-9c6e-1f3a5b7d9e2c';

export const EX_RASCUNHO_PEDIDO = {
  nome: 'Rui Silva Condutor',
  telefone: '+351 912 345 678',
  nif: '258714638',
  documento: { tipo: 'cc', numero: '12345678 9 ZZ1', validade: '2031-05-20' },
  carta_conducao: { categorias: ['B'] },
  em_formacao_tvde: true,
  consentimento: { versao: '2026-10', aceite_em: '2026-10-09T15:42:00+01:00' },
};

export const EX_CANDIDATURA_CONTA = {
  candidatura: {
    id: EX_CANDIDATURA_ID,
    estado: 'rascunho',
    motivo_rejeicao: null,
    submetida_em: null,
    dados: {
      nome: 'Rui Silva Condutor',
      telefone: '+351 912 345 678',
      nif: '258714638',
      documento: { tipo: 'cc', numero: '12345678 9 ZZ1', validade: '2031-05-20' },
      carta_conducao: { numero: null, categorias: ['B'], validade: null },
      licenca_tvde: null,
      em_formacao_tvde: true,
    },
    documentos: {
      documento_frente: { recebido: false },
      carta_frente: { recebido: true },
      carta_verso: { recebido: false },
    },
    em_falta: ['documento_frente', 'documento_verso'],
    campos_em_falta: ['email', 'iban'],
    pode_submeter: false,
  },
};

export const EX_PEDIDO_ENVIO = { content_type: 'image/jpeg', tamanho: 1843200 };

export const EX_ENVIO_DOCUMENTO = {
  upload_url:
    'https://hkqzzxgeedsmjnhyquke.supabase.co/storage/v1/object/upload/sign/motorista-documentos/' +
    `${EX_USER_ID}/candidatura/carta_frente/${EX_FICHEIRO_ID}.jpg?token=exemplo`,
  caminho: `${EX_USER_ID}/candidatura/carta_frente/${EX_FICHEIRO_ID}.jpg`,
  expira_em: '2026-10-16T16:30:00.000Z',
  metodo: 'PUT',
  cabecalhos: { 'Content-Type': 'image/jpeg' },
};

const TIPOS = [
  'documento_frente',
  'documento_verso',
  'carta_frente',
  'carta_verso',
  'licenca_tvde',
  'registo_criminal',
  'comprovativo_morada',
  'comprovativo_iban',
];

const texto = (description: string, extra: Esquema = {}): Esquema => ({
  type: 'string',
  description,
  ...extra,
});

export function esquemasContaCandidatura(): Record<string, Esquema> {
  return {
    CandidaturaContaPedido: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      description:
        'Campos do rascunho, todos opcionais: só os que vierem são gravados, os outros ficam ' +
        'como estavam. Os mesmos campos e formatos de CandidaturaTvdeNova, sem ' +
        'referencia_externa e sem ficheiros. Campo desconhecido (user_id, status, ...) dá 400. ' +
        'licenca_tvde, modelo_pretendido_id, data_inicio_pretendida e observacoes aceitam null ' +
        'para limpar. O formato valida-se ao gravar; o NIF e o IBAN com dígito de controlo ' +
        'errado dão 422 PEDIDO_INVALIDO, e o que falta para submeter só se vê no POST.',
      properties: {
        nome: texto('Nome completo.', { maxLength: 200 }),
        email: texto('Email do motorista.', { maxLength: 254, format: 'email' }),
        telefone: texto('Com ou sem indicativo.', { maxLength: 20 }),
        nif: texto('NIF português: 9 dígitos.', { pattern: '^\\d{9}$' }),
        morada: texto('Morada.', { maxLength: 200 }),
        codigo_postal: texto('Formato 0000-000.', { pattern: '^\\d{4}-\\d{3}$' }),
        cidade: texto('Cidade ou localidade.', { maxLength: 100 }),
        documento: {
          type: 'object',
          additionalProperties: false,
          description: 'Documento de identificação; cada campo é opcional.',
          properties: {
            tipo: { type: 'string', enum: ['cc', 'bi', 'ar', 'tr', 'passaporte'] },
            numero: texto('Número do documento.', { maxLength: 40 }),
            validade: texto('AAAA-MM-DD, depois de hoje.', { format: 'date' }),
          },
        },
        carta_conducao: {
          type: 'object',
          additionalProperties: false,
          description: 'Carta de condução; cada campo é opcional.',
          properties: {
            numero: texto('Número da carta.', { maxLength: 40 }),
            categorias: {
              type: 'array',
              minItems: 1,
              maxItems: 16,
              items: {
                type: 'string',
                enum: ['A', 'A1', 'A2', 'AM', 'B', 'B1', 'BE', 'C', 'C1', 'CE', 'D', 'D1', 'DE'],
              },
            },
            validade: texto('AAAA-MM-DD, depois de hoje.', { format: 'date' }),
          },
        },
        licenca_tvde: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            numero: texto('Número da licença TVDE.', { maxLength: 40 }),
            validade: texto('AAAA-MM-DD, depois de hoje.', { format: 'date' }),
          },
        },
        em_formacao_tvde: { type: 'boolean' },
        iban: texto('IBAN, com ou sem espaços.'),
        modelo_pretendido_id: { type: ['string', 'null'], format: 'uuid' },
        data_inicio_pretendida: {
          type: ['string', 'null'],
          format: 'date',
          description: 'Entre hoje e daqui a 180 dias.',
        },
        observacoes: { type: ['string', 'null'], maxLength: 1000 },
        consentimento: {
          type: 'object',
          additionalProperties: false,
          required: ['versao', 'aceite_em'],
          properties: {
            versao: texto('Versão do texto aceite.', { maxLength: 50 }),
            aceite_em: texto('ISO 8601 com fuso, não no futuro.', { format: 'date-time' }),
          },
        },
      },
      example: EX_RASCUNHO_PEDIDO,
    },
    CandidaturaConta: {
      type: 'object',
      description:
        'A candidatura da conta, dentro de "candidatura": o estado (rascunho até ser ' +
        'submetida), os campos já gravados, que ficheiros já foram recebidos e o que falta ' +
        'para poder submeter. Nunca traz caminhos do storage.',
      properties: {
        candidatura: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            estado: {
              type: 'string',
              enum: ['rascunho', 'submetido', 'em_analise', 'aprovado', 'rejeitado'],
              description: 'Só em rascunho se grava, se enviam ficheiros e se submete.',
            },
            motivo_rejeicao: { type: ['string', 'null'], description: 'Só quando rejeitado.' },
            submetida_em: { type: ['string', 'null'], format: 'date-time' },
            dados: {
              type: 'object',
              description: 'Os campos já gravados, com o formato de CandidaturaContaPedido.',
              additionalProperties: true,
            },
            documentos: {
              type: 'object',
              description: 'Por tipo de documento: { recebido: true } quando já há ficheiro.',
              additionalProperties: {
                type: 'object',
                properties: { recebido: { type: 'boolean' } },
              },
            },
            em_falta: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tipos de documento ainda por enviar.',
            },
            campos_em_falta: {
              type: 'array',
              items: { type: 'string' },
              description: 'Campos ainda por preencher.',
            },
            pode_submeter: {
              type: 'boolean',
              description: 'true quando é rascunho e não falta nada.',
            },
          },
        },
      },
      example: EX_CANDIDATURA_CONTA,
    },
    PedidoEnvioDocumento: {
      type: 'object',
      required: ['content_type', 'tamanho'],
      additionalProperties: false,
      properties: {
        content_type: {
          type: 'string',
          enum: ['application/pdf', 'image/jpeg', 'image/png'],
          description: 'O formato que vai enviar. É confirmado pelo conteúdo real do ficheiro.',
        },
        tamanho: {
          type: 'integer',
          minimum: 1,
          maximum: 10485760,
          description: 'Bytes do ficheiro, até 10 MB.',
        },
      },
      example: EX_PEDIDO_ENVIO,
    },
    EnvioDocumento: {
      type: 'object',
      description: 'Onde enviar o ficheiro e o caminho a confirmar depois.',
      properties: {
        upload_url: texto('URL assinado; serve para um só ficheiro, sem chave nem token.'),
        caminho: texto('Passe-o tal e qual a PUT /conta/candidatura-documentos/{tipo}.'),
        expira_em: texto('Até quando o URL aceita o envio (cerca de 2 h).', {
          format: 'date-time',
        }),
        metodo: { type: 'string', enum: ['PUT'] },
        cabecalhos: {
          type: 'object',
          description: 'Cabeçalhos a enviar no PUT ao upload_url.',
          additionalProperties: { type: 'string' },
        },
      },
      example: EX_ENVIO_DOCUMENTO,
    },
    ConfirmarDocumento: {
      type: 'object',
      required: ['caminho'],
      additionalProperties: false,
      properties: { caminho: texto('O caminho devolvido no pedido de envio.') },
      example: { caminho: EX_ENVIO_DOCUMENTO.caminho },
    },
  };
}

interface Ajudas {
  json: (schema: Esquema, example: unknown) => Esquema;
  respostaErro: (descricao: string, codigo: string, mensagem: string) => Esquema;
}

const DESCRICAO_ENVIO =
  'Como enviar um ficheiro, em três passos. (1) POST aqui com { content_type, tamanho }: ' +
  'a API devolve upload_url, caminho, expira_em, metodo (PUT) e cabecalhos. (2) PUT do ' +
  'ficheiro, em bytes crus (não multipart), ao upload_url, com os cabecalhos devolvidos ' +
  '(Content-Type); este pedido vai directo ao storage, sem X-API-Key nem X-Conta-Token, e o ' +
  'URL vale cerca de 2 h para um só ficheiro. (3) PUT /conta/candidatura-documentos/{tipo} ' +
  'com { caminho }: a API abre o ficheiro, confirma que existe, tem até 10 MB e é mesmo um ' +
  'PDF, JPEG ou PNG (pelo conteúdo, não pelo content_type) e só então o regista. Se não ' +
  'passar, o ficheiro é apagado e a resposta é 422. Exemplo: ' +
  'const e = await (await fetch(`${API}/conta/candidatura-documentos/carta_frente`, { method: ' +
  "'POST', headers: { 'X-API-Key': chave, 'X-Conta-Token': token, 'Content-Type': " +
  "'application/json' }, body: JSON.stringify({ content_type: f.type, tamanho: f.size }) })).json(); " +
  "await fetch(e.upload_url, { method: 'PUT', headers: e.cabecalhos, body: f }); " +
  "await fetch(`${API}/conta/candidatura-documentos/carta_frente`, { method: 'PUT', headers: " +
  "{ 'X-API-Key': chave, 'X-Conta-Token': token, 'Content-Type': 'application/json' }, body: " +
  'JSON.stringify({ caminho: e.caminho }) });';

export function caminhosContaCandidatura(
  a: Ajudas,
  base: {
    descricao: string;
    parametroToken: Esquema;
    erros: (permissao: string) => Esquema;
  }
): Record<string, Esquema> {
  const { descricao, parametroToken, erros } = base;
  const candidatura = (texto: string) => ({
    description: texto,
    content: a.json({ $ref: '#/components/schemas/CandidaturaConta' }, EX_CANDIDATURA_CONTA),
  });
  const naoEditavel = a.respostaErro(
    'A candidatura já foi submetida: já não se grava nem se enviam ficheiros',
    'CANDIDATURA_NAO_EDITAVEL',
    'A candidatura já foi submetida e não pode ser alterada.'
  );
  const tipo = {
    name: 'tipo',
    in: 'path',
    required: true,
    description: `O documento: ${TIPOS.join(', ')}.`,
    schema: { type: 'string', enum: TIPOS },
    example: 'carta_frente',
  };
  const pedidoInvalido = (texto: string) =>
    a.respostaErro(texto, 'PARAMETRO_INVALIDO', 'tipo de documento desconhecido.');
  return {
    '/conta/candidatura': {
      get: {
        summary: 'A candidatura TVDE da conta',
        description:
          descricao +
          ' O rascunho e o estado da candidatura da conta nesta organização, sem caminhos do ' +
          'storage. 404 NAO_ENCONTRADO enquanto não houver candidatura.',
        tags: ['Conta'],
        'x-permissao': 'conta:read',
        parameters: [parametroToken],
        responses: {
          '200': candidatura('A candidatura'),
          ...erros('conta:read'),
          '404': a.respostaErro(
            'A conta ainda não tem candidatura',
            'NAO_ENCONTRADO',
            'Candidatura não encontrada.'
          ),
        },
      },
      put: {
        summary: 'Guardar o rascunho da candidatura',
        description:
          descricao +
          ' Cria o rascunho na primeira chamada e actualiza-o nas seguintes; só se grava ' +
          'enquanto o estado é rascunho (senão 409 CANDIDATURA_NAO_EDITAVEL). Corpo JSON até 64 KB.',
        tags: ['Conta'],
        'x-permissao': 'conta:write',
        parameters: [parametroToken],
        requestBody: {
          required: true,
          content: a.json(
            { $ref: '#/components/schemas/CandidaturaContaPedido' },
            EX_RASCUNHO_PEDIDO
          ),
        },
        responses: {
          '200': candidatura('Rascunho gravado'),
          ...erros('conta:write'),
          '400': a.respostaErro(
            'Campo desconhecido, mal formado ou corpo vazio, NIF ou IBAN com o dígito de ' +
              'controlo errado, email diferente do da conta (PARAMETRO_INVALIDO), ou JSON ' +
              'inválido (CORPO_INVALIDO)',
            'PARAMETRO_INVALIDO',
            'nif tem de ter 9 dígitos (NIF português).'
          ),
          '409': naoEditavel,
        },
      },
      post: {
        summary: 'Submeter a candidatura',
        description:
          descricao +
          ' Passa o rascunho a submetido para a equipa analisar; sem corpo. Só com tudo ' +
          'preenchido e os ficheiros obrigatórios enviados: senão 422 CANDIDATURA_INCOMPLETA, ' +
          'com a lista do que falta em detalhes ({ campos, documentos }). Já submetida, devolve-a ' +
          'tal como está. Depois de submetida já não muda.',
        tags: ['Conta'],
        'x-permissao': 'conta:write',
        parameters: [parametroToken],
        responses: {
          '200': candidatura('Candidatura submetida'),
          ...erros('conta:write'),
          '404': a.respostaErro(
            'A conta não tem candidatura',
            'NAO_ENCONTRADO',
            'Candidatura não encontrada.'
          ),
          '409': a.respostaErro(
            'Já submetida (CANDIDATURA_NAO_EDITAVEL) ou já existe candidatura em curso com este ' +
              'NIF ou email (CANDIDATURA_EXISTENTE)',
            'CANDIDATURA_NAO_EDITAVEL',
            'A candidatura já foi submetida e não pode ser alterada.'
          ),
          '422': {
            description: 'Faltam campos ou ficheiros: detalhes traz a lista',
            content: a.json(
              { $ref: '#/components/schemas/Erro' },
              {
                erro: {
                  codigo: 'CANDIDATURA_INCOMPLETA',
                  mensagem: 'Falta preencher: iban, carta_frente.',
                  detalhes: { campos: ['iban'], documentos: ['carta_frente'] },
                },
              }
            ),
          },
        },
      },
    },
    '/conta/candidatura-documentos/{tipo}': {
      post: {
        summary: 'Pedir o envio de um ficheiro da candidatura',
        description:
          descricao +
          ' ' +
          DESCRICAO_ENVIO +
          ' Só com a candidatura em rascunho. Limite de 60 pedidos por dia por conta e chave.',
        tags: ['Conta'],
        'x-permissao': 'conta:write',
        parameters: [parametroToken, tipo],
        requestBody: {
          required: true,
          content: a.json({ $ref: '#/components/schemas/PedidoEnvioDocumento' }, EX_PEDIDO_ENVIO),
        },
        responses: {
          '200': {
            description: 'Onde enviar o ficheiro',
            content: a.json({ $ref: '#/components/schemas/EnvioDocumento' }, EX_ENVIO_DOCUMENTO),
          },
          ...erros('conta:write'),
          '400': pedidoInvalido(
            'tipo desconhecido, content_type fora de PDF/JPEG/PNG, tamanho acima de 10 MB ou ' +
              'corpo inválido (PARAMETRO_INVALIDO, CORPO_INVALIDO)'
          ),
          '404': a.respostaErro(
            'A conta ainda não tem candidatura: guarde o rascunho primeiro',
            'NAO_ENCONTRADO',
            'Ainda não há candidatura: guarde o rascunho primeiro.'
          ),
          '409': naoEditavel,
          '429': a.respostaErro(
            'Limite de pedidos por minuto da chave, ou de 60 envios por dia por conta, excedido; ' +
              'ver Retry-After',
            'LIMITE_EXCEDIDO',
            'Limite de 60 envios por dia excedido.'
          ),
        },
      },
      put: {
        summary: 'Confirmar um ficheiro enviado',
        description:
          descricao +
          ' Depois do PUT ao upload_url: a API verifica o ficheiro (existe, até 10 MB, PDF/JPEG/' +
          'PNG pelo conteúdo e do próprio tipo e conta) e regista-o. Enviar outro ficheiro do ' +
          'mesmo tipo substitui o anterior, que é apagado. Um ficheiro inválido é apagado e ' +
          'a resposta é 422 PEDIDO_INVALIDO. Corpo { caminho }.',
        tags: ['Conta'],
        'x-permissao': 'conta:write',
        parameters: [parametroToken, tipo],
        requestBody: {
          required: true,
          content: a.json(
            { $ref: '#/components/schemas/ConfirmarDocumento' },
            { caminho: EX_ENVIO_DOCUMENTO.caminho }
          ),
        },
        responses: {
          '200': candidatura('Ficheiro registado na candidatura'),
          ...erros('conta:write'),
          '400': pedidoInvalido(
            'tipo desconhecido, corpo inválido, ou caminho que não é deste tipo e desta conta ' +
              '(PARAMETRO_INVALIDO, CORPO_INVALIDO)'
          ),
          '404': a.respostaErro(
            'Não há ficheiro nesse caminho: envie-o primeiro para o upload_url',
            'NAO_ENCONTRADO',
            'Ficheiro não encontrado: envie-o primeiro para o upload_url.'
          ),
          '409': naoEditavel,
          '422': a.respostaErro(
            'O ficheiro tem mais de 10 MB ou não é um PDF, JPEG ou PNG válido; foi apagado',
            'PEDIDO_INVALIDO',
            'O ficheiro tem de ser um PDF, JPEG ou PNG válido.'
          ),
        },
      },
      delete: {
        summary: 'Remover um ficheiro da candidatura',
        description:
          descricao + ' Só com a candidatura em rascunho; o ficheiro fica apagado do storage.',
        tags: ['Conta'],
        'x-permissao': 'conta:write',
        parameters: [parametroToken, tipo],
        responses: {
          '200': candidatura('Ficheiro removido'),
          ...erros('conta:write'),
          '400': pedidoInvalido('tipo desconhecido (PARAMETRO_INVALIDO)'),
          '404': a.respostaErro(
            'A conta não tem candidatura',
            'NAO_ENCONTRADO',
            'Candidatura não encontrada.'
          ),
          '409': naoEditavel,
        },
      },
    },
  };
}
