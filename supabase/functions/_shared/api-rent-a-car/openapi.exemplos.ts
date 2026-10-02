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
  imagem_url:
    'https://hkqzzxgeedsmjnhyquke.supabase.co/storage/v1/object/public/modelos-viaturas/org/clio.webp',
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
};

export const EX_APRESENTACAO = {
  nome: 'WeGest — API Rent-a-Car',
  versao: '1.0.0',
  documentacao: 'https://docs.wegest.pt',
};

export const exErro = (codigo: string, mensagem: string) => ({ erro: { codigo, mensagem } });
