// OpenAPI da conta de cliente (reservas e faturas da pessoa que entrou no site). Funções
// puras: recebem os helpers de openapi.ts, que as chama, para não haver import circular.
import { caminhosContaCandidatura, esquemasContaCandidatura } from './openapi.contaCandidatura.ts';
import { EX_LOCALIZACAO, EX_MODELO } from './openapi.exemplos.ts';

type Esquema = Record<string, unknown>;

const EX_CONTA_CLIENTE_ID = '3f6a9c1e-7b2d-4e8f-9a0b-1c2d3e4f5a6b';
const EX_FATURA_ID = '8e9f0a1b-2c3d-4e5f-8a6b-7c8d9e0f1a2b';

// Só para o exemplo: um access_token do Supabase Auth tem esta forma (header.payload.assinatura).
export const EX_TOKEN_CONTA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIuLi4ifQ.assinatura';

export const EX_CONTA = {
  email: 'carla@exemplo.pt',
  email_confirmado: true,
  tipo: 'cliente',
  cliente: {
    id: EX_CONTA_CLIENTE_ID,
    nome: 'Carla Nova',
    nif: '258714638',
    telefone: '+351 912 345 678',
  },
  motorista: null,
};

export const EX_RESERVA_CONTA = {
  codigo: 1042,
  estado: 'confirmada',
  origem: 'site',
  inicio: '2026-10-20T09:00:00+00:00',
  fim: '2026-10-23T09:00:00+00:00',
  dias: 3,
  modelo: { marca: EX_MODELO.marca, modelo: EX_MODELO.modelo },
  matricula: 'AA-00-BB',
  estacoes: { entrega: EX_LOCALIZACAO.nome, recolha: 'Porto' },
  total: { sem_iva: 105, com_iva: 129.15, iva: 23 },
  pode_cancelar: false,
};

export const EX_FATURA_CONTA = {
  id: EX_FATURA_ID,
  tipo: 'FT',
  serie: '67',
  numero: '12',
  data_emissao: '2026-10-23',
  total: 105,
  contrato_codigo: 815,
  reserva_codigo: 1204,
};

const DESCRICAO_TOKEN =
  'Obrigatório. O access_token da sessão Supabase Auth da pessoa no WeGest (o JWT que o ' +
  'supabase-js guarda depois de entrar no site). A API confirma-o no WeGest a cada pedido ' +
  'e só devolve o que é da ficha de cliente ligada a essa conta na organização da chave. ' +
  'Em falta, inválido ou expirado dá 401 SESSAO_INVALIDA: renove a sessão e repita. ' +
  'X-Motorista-Token é aceite como sinónimo; com os dois, vale o X-Conta-Token. Não é o ' +
  'Authorization, que continua a ser alternativa à X-API-Key. Nunca o guarde nem o registe ' +
  'nos logs do site.';

const DESCRICAO_CONTA =
  'Chamada a partir do servidor do site, com a chave da organização e o token da pessoa que ' +
  'entrou. Sem cache (Cache-Control: no-store, também nos erros).';

const parametroToken = {
  name: 'X-Conta-Token',
  in: 'header',
  required: true,
  description: DESCRICAO_TOKEN,
  schema: { type: 'string', maxLength: 4096 },
  example: EX_TOKEN_CONTA,
};

const texto = (description: string): Esquema => ({ type: 'string', description });
const textoOuNulo = (description: string): Esquema => ({ type: ['string', 'null'], description });

export function esquemasConta(): Record<string, Esquema> {
  return {
    Conta: {
      type: 'object',
      description:
        'A conta que entrou e o que ela é nesta organização. Uma conta nova do site é do tipo ' +
        'cliente; a ficha de cliente liga-se depois de a pessoa confirmar o email.',
      properties: {
        email: texto('Email da conta.'),
        email_confirmado: {
          type: 'boolean',
          description:
            'Na prática, sempre true: antes de confirmar o email não há sessão, logo não há ' +
            'token para chamar a API (o site mostra "verifique o email" a partir da resposta ' +
            'do signUp).',
        },
        tipo: {
          type: 'string',
          enum: ['cliente', 'motorista', 'colaborador'],
          description: 'cliente para as contas criadas no site de rent-a-car.',
        },
        cliente: {
          type: ['object', 'null'],
          description:
            'A ficha de cliente ligada a esta conta nesta organização; null quando ainda não ' +
            'há ficha ligada. A primeira chamada com a chave do site liga ou cria a ficha; se ' +
            'continuar null, contacte a equipa.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: texto('Nome na ficha.'),
            nif: textoOuNulo('NIF na ficha; null para clientes estrangeiros.'),
            telefone: textoOuNulo('Telefone na ficha.'),
          },
        },
        motorista: {
          type: ['object', 'null'],
          description: 'Só para contas de motorista TVDE desta organização; senão null.',
          properties: {
            candidatura: {
              type: ['object', 'null'],
              description: 'A candidatura TVDE ligada à conta, se houver.',
              properties: {
                id: { type: 'string', format: 'uuid' },
                estado: {
                  type: ['string', 'null'],
                  enum: ['rascunho', 'submetido', 'em_analise', 'aprovado', 'rejeitado', null],
                  description:
                    'rascunho enquanto o motorista não submeteu; null quando a candidatura não ' +
                    'tem estado.',
                },
              },
            },
            ficha: { type: 'boolean', description: 'true quando já é motorista da organização.' },
          },
        },
      },
      example: EX_CONTA,
    },
    ReservaConta: {
      type: 'object',
      description:
        'Uma reserva de rent-a-car da ficha de cliente ligada à conta, venha do site ou da ' +
        'equipa.',
      properties: {
        codigo: { type: 'integer', description: 'Número da reserva no WeGest.' },
        estado: {
          type: 'string',
          enum: ['pendente', 'confirmada', 'em_curso', 'concluida', 'cancelada', 'expirada'],
        },
        origem: texto('De onde veio a reserva (ex.: site).'),
        inicio: { type: 'string', format: 'date-time', description: 'Levantamento, em UTC.' },
        fim: {
          type: ['string', 'null'],
          format: 'date-time',
          description:
            'Devolução, em UTC; null numa reserva sem data de devolução marcada (criada pela ' +
            'equipa em aberto).',
        },
        dias: {
          type: ['integer', 'null'],
          description: 'Dias facturados; null quando fim é null (sem devolução não há contagem).',
        },
        modelo: {
          type: ['object', 'null'],
          properties: { marca: texto('Marca.'), modelo: texto('Modelo.') },
        },
        matricula: textoOuNulo(
          'Só depois de a equipa confirmar (confirmada, em_curso, concluida); null numa ' +
            'reserva pendente.'
        ),
        estacoes: {
          type: 'object',
          description: 'Nomes das estações de entrega e recolha.',
          properties: { entrega: textoOuNulo('Entrega.'), recolha: textoOuNulo('Recolha.') },
        },
        total: {
          type: ['object', 'null'],
          description: 'Total com e sem IVA: o da cotação do site ou, sem ela, o da reserva.',
          properties: {
            sem_iva: { type: 'number' },
            com_iva: { type: 'number' },
            iva: { type: 'number' },
          },
        },
        pode_cancelar: {
          type: 'boolean',
          description:
            'true enquanto está pendente e o levantamento não chegou: só então o DELETE ' +
            '/conta/reservas/{codigo} a cancela.',
        },
      },
      example: EX_RESERVA_CONTA,
    },
    FaturaConta: {
      type: 'object',
      description:
        'Um documento de um contrato de rent-a-car emitido em nome do cliente da conta ' +
        '(destinatário fiscal). Documentos do mesmo contrato em nome de outra entidade não ' +
        'aparecem.',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Usado em /conta/faturas/{id} para o PDF.',
        },
        tipo: {
          type: 'string',
          enum: ['FT', 'FR', 'NC', 'RC'],
          description: 'FT fatura, FR fatura-recibo, NC nota de crédito, RC recibo.',
        },
        serie: textoOuNulo('Série do documento no programa de faturação.'),
        numero: textoOuNulo('Número do documento na série.'),
        data_emissao: { type: ['string', 'null'], format: 'date' },
        total: {
          type: ['number', 'null'],
          description: 'Total do documento, com IVA, em euros.',
        },
        contrato_codigo: {
          type: ['integer', 'null'],
          description:
            'Número do contrato; null quando a fatura foi emitida numa reserva que ainda não passou a contrato.',
        },
        reserva_codigo: {
          type: ['integer', 'null'],
          description: 'Número da reserva de onde a fatura veio, quando existe.',
        },
      },
      example: EX_FATURA_CONTA,
    },
    ...esquemasContaCandidatura(),
  };
}

interface Ajudas {
  json: (schema: Esquema, example: unknown) => Esquema;
  respostaErro: (descricao: string, codigo: string, mensagem: string) => Esquema;
  /** Erros dos pedidos com chave e id, sem corpo (404, 401, 403, 429, 500, 503). */
  erros: Esquema;
}

export function caminhosConta(a: Ajudas): Record<string, Esquema> {
  const sessao = a.respostaErro(
    'SESSAO_INVALIDA: falta o X-Conta-Token, ou é inválido ou expirou (renove a sessão e ' +
      'repita). Sem chave de API válida, NAO_AUTENTICADO',
    'SESSAO_INVALIDA',
    'Sessão inválida ou expirada. Volte a entrar.'
  );
  const semPermissao = (permissao: string) =>
    a.respostaErro(
      `Chave sem ${permissao} (SEM_PERMISSAO) ou a conta já não existe (CONTA_INVALIDA)`,
      'SEM_PERMISSAO',
      `A chave não tem a permissão ${permissao}.`
    );
  const lista = (ref: string, exemplo: unknown, descricao: string) => ({
    description: descricao,
    content: a.json({ type: 'array', items: { $ref: `#/components/schemas/${ref}` } }, [exemplo]),
  });
  const erros = (permissao: string) => ({
    ...a.erros,
    '401': sessao,
    '403': semPermissao(permissao),
  });
  return {
    '/conta': {
      get: {
        summary: 'A conta que entrou no site',
        description:
          DESCRICAO_CONTA +
          ' Diz se o email está confirmado e que ficha de cliente (ou de motorista) a conta ' +
          'tem nesta organização.',
        tags: ['Conta'],
        'x-permissao': 'conta:read',
        parameters: [parametroToken],
        responses: {
          '200': {
            description: 'A conta',
            content: a.json({ $ref: '#/components/schemas/Conta' }, EX_CONTA),
          },
          ...erros('conta:read'),
        },
      },
    },
    '/conta/reservas': {
      get: {
        summary: 'As reservas de rent-a-car da conta',
        description:
          DESCRICAO_CONTA +
          ' Mais recentes primeiro. Lista vazia enquanto a conta não tiver ficha de cliente ' +
          'ligada. A matrícula só aparece depois de a equipa confirmar a reserva.',
        tags: ['Conta'],
        'x-permissao': 'conta:read',
        parameters: [parametroToken],
        responses: {
          '200': lista('ReservaConta', EX_RESERVA_CONTA, 'Reservas da conta'),
          ...erros('conta:read'),
        },
      },
    },
    '/conta/reservas/{codigo}': {
      delete: {
        summary: 'Cancelar uma reserva pendente da conta',
        description:
          DESCRICAO_CONTA +
          ' Só uma reserva da própria conta, pendente e com o levantamento por chegar ' +
          '(pode_cancelar: true). Depois de confirmada, o cancelamento é feito com a equipa.',
        tags: ['Conta'],
        'x-permissao': 'conta:write',
        parameters: [
          parametroToken,
          {
            name: 'codigo',
            in: 'path',
            required: true,
            description: 'O codigo da reserva (de /conta/reservas).',
            schema: { type: 'integer', minimum: 1 },
            example: EX_RESERVA_CONTA.codigo,
          },
        ],
        responses: {
          '200': {
            description: 'Reserva cancelada',
            content: a.json(
              { $ref: '#/components/schemas/ReservaConta' },
              { ...EX_RESERVA_CONTA, estado: 'cancelada', matricula: null, pode_cancelar: false }
            ),
          },
          ...erros('conta:write'),
          '404': a.respostaErro(
            'A reserva não existe ou não é desta conta',
            'NAO_ENCONTRADO',
            'Reserva não encontrada.'
          ),
          '409': a.respostaErro(
            'A reserva já não está pendente ou o levantamento já passou',
            'ESTADO_INVALIDO',
            'A reserva já foi confirmada pela equipa; o cancelamento é feito com ela.'
          ),
        },
      },
    },
    '/conta/faturas': {
      get: {
        summary: 'As faturas da conta',
        description:
          DESCRICAO_CONTA +
          ' Os documentos dos contratos de rent-a-car emitidos em nome do cliente da conta ' +
          '(destinatário fiscal), mais recentes primeiro; os emitidos a outra entidade (uma ' +
          'empresa que paga, por exemplo) ficam de fora. Lista vazia enquanto a conta não ' +
          'tiver ficha ligada.',
        tags: ['Conta'],
        'x-permissao': 'conta:read',
        parameters: [parametroToken],
        responses: {
          '200': lista('FaturaConta', EX_FATURA_CONTA, 'Faturas da conta'),
          ...erros('conta:read'),
        },
      },
    },
    '/conta/faturas/{id}': {
      get: {
        summary: 'O PDF de uma fatura da conta',
        description:
          DESCRICAO_CONTA +
          ' O PDF pede-se na hora ao programa de faturação: pode demorar até cerca de 45 s ' +
          '(dê esse tempo ao pedido e não repita antes). A resposta é o ficheiro ' +
          '(application/pdf, inline, Cache-Control: private, no-store); passe-o ao browser tal ' +
          'e qual. Se o programa de faturação não responder, 503 ERRO_INTERNO "Fatura ' +
          'indisponível de momento": tente mais tarde. Uma fatura sem número no programa de ' +
          'faturação dá 404 "Esta fatura não tem PDF disponível.". Limite de 10 PDF por minuto ' +
          'por conta e chave.',
        tags: ['Conta'],
        'x-permissao': 'conta:read',
        parameters: [
          parametroToken,
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'O id da fatura (de /conta/faturas).',
            schema: { type: 'string', format: 'uuid' },
            example: EX_FATURA_CONTA.id,
          },
        ],
        responses: {
          '200': {
            description: 'O PDF da fatura',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          ...erros('conta:read'),
          '404': a.respostaErro(
            'A fatura não existe ou não é desta conta ("Fatura não encontrada."), ou não tem ' +
              'número no programa de faturação ("Esta fatura não tem PDF disponível.")',
            'NAO_ENCONTRADO',
            'Fatura não encontrada.'
          ),
          '429': a.respostaErro(
            'Limite de pedidos por minuto da chave, ou de 10 PDF por minuto por conta, ' +
              'excedido; ver Retry-After',
            'LIMITE_EXCEDIDO',
            'Limite de 10 faturas por minuto excedido.'
          ),
        },
      },
    },
    ...caminhosContaCandidatura(a, { descricao: DESCRICAO_CONTA, parametroToken, erros }),
  };
}
