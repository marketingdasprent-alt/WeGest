// Códigos de erro da API, para a página Erros e para a pesquisa. Os activos
// (fases A, B e C, em ERROS_FASE_A) têm de bater com os exemplos de erro do
// OpenAPI (ver o teste).

export interface CodigoDeErro {
  codigo: string;
  estados: string[];
  quando: string;
  fazer: string;
}

export const ERROS_FASE_A: CodigoDeErro[] = [
  {
    codigo: 'NAO_AUTENTICADO',
    estados: ['401'],
    quando: 'Sem cabeçalho X-API-Key, ou chave desconhecida.',
    fazer: 'Confirme que a variável de ambiente tem a chave inteira, com o prefixo wg_ra_.',
  },
  {
    codigo: 'SEM_PERMISSAO',
    estados: ['403'],
    quando: 'Chave sem a permissão do recurso, desactivada, expirada ou fora da whitelist.',
    fazer: 'Veja a chave em Integrações → Chaves de API; crie outra se estiver desactivada.',
  },
  {
    codigo: 'PARAMETRO_INVALIDO',
    estados: ['400'],
    quando:
      'Um parâmetro ou campo do corpo tem um valor que a API não aceita (ex.: data sem fuso, ' +
      'extra repetido, quantidade fora do limite).',
    fazer: 'Corrija o pedido; a mensagem diz que parâmetro falhou.',
  },
  {
    codigo: 'CORPO_INVALIDO',
    estados: ['400', '413'],
    quando: 'Corpo JSON inválido (400) ou acima de 64 KB (413).',
    fazer: 'Envie JSON válido com Content-Type: application/json.',
  },
  {
    codigo: 'PERIODO_INVALIDO',
    estados: ['400'],
    quando:
      'O fim não é depois do início, ou o início já passou. No TVDE, também o início a mais de ' +
      '180 dias.',
    fazer: 'Peça um período no futuro, com o fim depois do início.',
  },
  {
    codigo: 'PERIODO_EXCEDE_MAXIMO',
    estados: ['400'],
    quando: 'Aluguer com mais de 30 dias.',
    fazer: 'Divida o período ou encaminhe o cliente para o aluguer de longa duração.',
  },
  {
    codigo: 'NAO_ENCONTRADO',
    estados: ['404'],
    quando: 'Rota ou recurso inexistente nesta organização.',
    fazer: 'Use os ids devolvidos pelas listas; não repita o pedido.',
  },
  {
    codigo: 'TARIFA_INDISPONIVEL',
    estados: ['409'],
    quando: 'Ainda não há preços para as datas pedidas (fora da validade da tarifa do site).',
    fazer: 'Mostre ao cliente que essas datas ainda não abriram; tente datas mais próximas.',
  },
  {
    codigo: 'SEM_DISPONIBILIDADE',
    estados: ['409'],
    quando: 'Não há viatura do modelo livre no período.',
    fazer: 'Volte a /disponibilidade e proponha outro modelo ou outras datas.',
  },
  {
    codigo: 'PRECO_ALTERADO',
    estados: ['409'],
    quando: 'Ao criar a reserva, o total já não é o total_esperado: o preço mudou desde a cotação.',
    fazer: 'Mostre ao cliente a cotação nova, que vem em erro.detalhes, e repita com o novo total.',
  },
  {
    codigo: 'ESTADO_INVALIDO',
    estados: ['409'],
    quando:
      'A reserva não está num estado que permita a acção (ex.: cancelar depois de confirmada).',
    fazer: 'Consulte a reserva; depois de confirmada, o cancelamento é feito com a equipa.',
  },
  {
    codigo: 'LIMITE_EXCEDIDO',
    estados: ['429'],
    quando: 'Passou o limite de pedidos por minuto.',
    fazer: 'Espere os segundos do cabeçalho Retry-After e use a cache do catálogo.',
  },
  {
    codigo: 'ERRO_INTERNO',
    estados: ['500', '503'],
    quando: 'Falha do nosso lado (500) ou serviço temporariamente indisponível (503).',
    fazer: 'Tente de novo com espera crescente; no 503 respeite o Retry-After.',
  },
  {
    codigo: 'CONFIG_EM_FALTA',
    estados: ['503'],
    quando:
      'A organização ainda não marcou a tarifa do site (disponibilidade e cotação) ou a tarifa ' +
      'TVDE do site (disponibilidade TVDE).',
    fazer: 'Não é um erro do seu pedido: avise o gestor da organização no WeGest.',
  },
];
