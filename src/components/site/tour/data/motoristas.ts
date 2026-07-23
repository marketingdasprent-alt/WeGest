export const MOTORISTAS_ALERTAS = [
  { label: 'sem ficha', valor: 4, tone: 'amber' as const, acao: 'associar' },
  { label: 'sem documentos', valor: 41, tone: 'red' as const, acao: 'atualizar' },
  { label: 'cartões', valor: 11, tone: 'blue' as const, acao: 'associar' },
  { label: 'sem portagens', valor: 15, tone: 'blue' as const, acao: 'associar' },
];

export const MOTORISTAS_TOTAL = 62;

export const MOTORISTAS_LISTA = [
  {
    codigo: 1,
    nome: 'Diogo Marreiros',
    telefone: '+351 935 637 551',
    gestor: 'Ana Bexiga',
    idBolt: 'b9da0c6f…',
    cidade: 'Lisboa',
    status: 'Ativo',
  },
  {
    codigo: 2,
    nome: 'Tatiana Chiarello',
    telefone: '913 461 471',
    gestor: '—',
    idBolt: null,
    cidade: '—',
    status: 'Inativo',
  },
  {
    codigo: 3,
    nome: 'Carlos Roberto Ferreira',
    telefone: '913 311 937',
    gestor: '—',
    idBolt: '09650282…',
    cidade: 'Vila Nova de Gaia',
    status: 'Inativo',
  },
  {
    codigo: 4,
    nome: 'Beatriz Country',
    telefone: '915 129 828',
    gestor: 'Ana Bexiga',
    idBolt: null,
    cidade: 'Lisboa',
    status: 'Ativo',
  },
  {
    codigo: 5,
    nome: 'Rui Espadinha',
    telefone: '912 503 486',
    gestor: '—',
    idBolt: null,
    cidade: '—',
    status: 'Inativo',
  },
  {
    codigo: 6,
    nome: 'Nuno Palhares',
    telefone: '960 431 828',
    gestor: '—',
    idBolt: null,
    cidade: 'Cascais',
    status: 'Ativo',
  },
  {
    codigo: 7,
    nome: 'Sara Vilhena',
    telefone: '911 113 979',
    gestor: 'Ana Bexiga',
    idBolt: '211e2e0b…',
    cidade: 'Porto',
    status: 'Ativo',
  },
];
