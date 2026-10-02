// Códigos de erro da API, para a página Erros e para a pesquisa. Os da fase A
// têm de bater com os exemplos de erro do OpenAPI (ver o teste).

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
    quando: 'Um parâmetro de consulta tem um valor que a API não aceita.',
    fazer: 'Corrija o pedido; a mensagem diz que parâmetro falhou.',
  },
  {
    codigo: 'NAO_ENCONTRADO',
    estados: ['404'],
    quando: 'Rota ou recurso inexistente nesta organização.',
    fazer: 'Use os ids devolvidos pelas listas; não repita o pedido.',
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
];

/** Códigos das fases B e C, já reservados. */
export const ERROS_EM_BREVE: { codigo: string; quando: string }[] = [
  { codigo: 'CORPO_INVALIDO', quando: 'Corpo JSON inválido ou acima de 64 KB.' },
  { codigo: 'PERIODO_INVALIDO', quando: 'Datas de levantamento e entrega incoerentes.' },
  { codigo: 'PERIODO_EXCEDE_MAXIMO', quando: 'Aluguer mais longo do que o permitido.' },
  { codigo: 'TARIFA_INDISPONIVEL', quando: 'A organização não tem tarifa do site activa.' },
  { codigo: 'SEM_DISPONIBILIDADE', quando: 'Não há viatura do modelo livre no período.' },
  { codigo: 'PRECO_ALTERADO', quando: 'O preço mudou desde a cotação.' },
  { codigo: 'CONFIG_EM_FALTA', quando: 'Falta configuração na organização para reservar.' },
  { codigo: 'ESTADO_INVALIDO', quando: 'A reserva não está num estado que permita a acção.' },
];
