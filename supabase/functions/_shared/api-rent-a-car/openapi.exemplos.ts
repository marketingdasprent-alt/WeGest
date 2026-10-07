// Exemplos da especificação OpenAPI (e, por ela, do site docs.wegest.pt).
// Dados plausíveis de uma organização de rent-a-car em Leiria, nunca dados reais
// de clientes. Ids inventados; dinheiro sempre { sem_iva, com_iva, iva } com
// IVA a 23% e 2 casas.

const preco = (semIva: number) => ({
  sem_iva: semIva,
  com_iva: Math.round(semIva * 1.23 * 100) / 100,
  iva: 23,
});

export const EX_PRECO = preco(35);

// Foto de uma viatura do modelo: link assinado, válido 24 h.
export const EX_FOTO_VIATURA =
  'https://hkqzzxgeedsmjnhyquke.supabase.co/storage/v1/object/sign/viatura-documentos/6f1e3d5b-7a9c-4b2e-8d4f-1a3c5e7b9d2f/fotos/1790777910834.webp?token=exemplo';

export const EX_LOCALIZACAO = {
  id: '3f1c2a6e-8b4d-4c1e-9a7f-1d2e3f4a5b6c',
  nome: 'Leiria — Centro',
  morada: 'Avenida Heróis de Angola, 100',
  cidade: 'Leiria',
  horario: 'Seg-Sex 9h-19h, Sáb 9h-13h',
  latitude: 39.7436,
  longitude: -8.8071,
};

const CATEGORIA_ID = '7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d';

export const EX_CATEGORIA = {
  id: CATEGORIA_ID,
  codigo: 'ECON',
  nome: 'Económico',
  descricao: 'Citadinos de 5 lugares, ideais para a cidade.',
  codigo_sipp: 'EDMR',
  imagem_url: null,
  combustivel: 'gasolina',
  idade_minima_condutor: 21,
  idade_maxima_condutor: null,
  preco_dia_desde: EX_PRECO,
  modelos: 2,
};

export const EX_MODELO = {
  id: 'b4e8f1a2-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  marca: 'Renault',
  modelo: 'Clio',
  categoria: { id: CATEGORIA_ID, nome: 'Económico' },
  tipo: 'passageiros',
  caixa: 'manual',
  combustivel: 'gasolina',
  lugares: 5,
  portas: 5,
  bagageira: 2,
  ar_condicionado: true,
  imagem_url: EX_FOTO_VIATURA,
  preco_dia: EX_PRECO,
  frota: 4,
};

export const EX_COBERTURA = {
  id: 'c9d0e1f2-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  nome: 'Cobertura total',
  descricao: 'Reduz a franquia a zero em danos e furto.',
  preco_dia: preco(12),
  franquia: null,
};

export const EX_MODELO_DETALHE = {
  ...EX_MODELO,
  tarifa: {
    km_incluidos: 200,
    km_adicional: preco(0.15),
    franquia: preco(1000),
    caucao: preco(300),
  },
  coberturas: [EX_COBERTURA],
};

export const EX_EXTRA = {
  id: 'd1e2f3a4-5b6c-4d7e-8f9a-0b1c2d3e4f5a',
  nome: 'Cadeira de bebé',
  descricao: 'Grupo 0+/1, até 18 kg.',
  preco: preco(5),
  tipo_calculo: 'dia',
  quantidade_maxima: 2,
};

export const EX_HEALTH = {
  ok: true,
  organizacao: 'e5f6a7b8-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  permissoes: ['catalogo:read'],
  tarifa_site: true,
  tarifa_site_tvde: false,
};

export const EX_APRESENTACAO = {
  nome: 'WeGest — API Rent-a-Car',
  versao: '1.0.0',
  documentacao: 'https://docs.wegest.pt',
};

export const exErro = (codigo: string, mensagem: string) => ({ erro: { codigo, mensagem } });

// --- Fase B: disponibilidade e cotação ----------------------------------------
// 3 dias de Clio, de 20 a 23 de Outubro de 2026 às 10h de Lisboa (+01:00).

export const EX_INICIO = '2026-10-20T10:00:00+01:00';
export const EX_FIM = '2026-10-23T10:00:00+01:00';
/** Segunda estação, para mostrar entrega e recolha em sítios diferentes. */
export const EX_LOCALIZACAO_RECOLHA_ID = '4a2d3b7f-9c5e-4d2f-8b8a-2e3f4a5b6c7d';

export const EX_PERIODO = {
  inicio: '2026-10-20T09:00:00+00:00',
  fim: '2026-10-23T09:00:00+00:00',
  dias: 3,
};

export const EX_MODELO_DISPONIVEL = {
  ...EX_MODELO,
  quantidade_disponivel: 2,
  cotacao: {
    dias: 3,
    preco_dia: EX_PRECO,
    aluguer: preco(105),
    franquia: EX_MODELO_DETALHE.tarifa.franquia,
    caucao: EX_MODELO_DETALHE.tarifa.caucao,
    km_incluidos: EX_MODELO_DETALHE.tarifa.km_incluidos,
  },
};

export const EX_DISPONIBILIDADE = { periodo: EX_PERIODO, modelos: [EX_MODELO_DISPONIVEL] };

const EXTRA_LIMPEZA_ID = 'e2f3a4b5-6c7d-4e8f-9a0b-1c2d3e4f5a6b';

export const EX_COTACAO_PEDIDO = {
  modelo_id: EX_MODELO.id,
  inicio: EX_INICIO,
  fim: EX_FIM,
  entrega: EX_LOCALIZACAO.id,
  recolha: EX_LOCALIZACAO_RECOLHA_ID,
  extras: [
    { extra_id: EX_EXTRA.id, quantidade: 2 },
    { extra_id: EXTRA_LIMPEZA_ID, quantidade: 1 },
  ],
  cobertura_id: EX_COBERTURA.id,
};

export const EX_LINHA_COTACAO = {
  tipo: 'aluguer',
  descricao: 'Renault Clio ou similar',
  quantidade: 3,
  preco_unitario: EX_PRECO,
  total: preco(105),
};

// Aluguer 105 + cobertura 3 × 12 = 36 + cadeira 2 × 5 × 3 dias = 30 + limpeza 20 = 191,00.
export const EX_COTACAO = {
  periodo: EX_PERIODO,
  modelo: { id: EX_MODELO.id, marca: EX_MODELO.marca, modelo: EX_MODELO.modelo },
  linhas: [
    EX_LINHA_COTACAO,
    {
      tipo: 'cobertura',
      descricao: EX_COBERTURA.nome,
      quantidade: 3,
      preco_unitario: preco(12),
      total: preco(36),
    },
    {
      tipo: 'extra',
      descricao: EX_EXTRA.nome,
      quantidade: 2,
      preco_unitario: preco(5),
      total: preco(30),
    },
    {
      tipo: 'extra',
      descricao: 'Limpeza final',
      quantidade: 1,
      preco_unitario: preco(20),
      total: preco(20),
    },
  ],
  subtotal: preco(191),
  franquia: EX_COBERTURA.franquia,
  caucao: EX_MODELO_DETALHE.tarifa.caucao,
  km_incluidos: EX_MODELO_DETALHE.tarifa.km_incluidos,
  km_adicional: EX_MODELO_DETALHE.tarifa.km_adicional,
  quantidade_disponivel: 2,
};
