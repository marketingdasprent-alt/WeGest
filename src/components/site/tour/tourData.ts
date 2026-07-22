import {
  LayoutDashboard,
  KeyRound,
  Car,
  User,
  CalendarDays,
  Wrench,
  BarChart3,
  Mail,
  HelpCircle,
  MessageCircle,
  Building2,
  ScrollText,
  ShieldCheck,
  CheckCircle2,
  Navigation,
  Sparkles,
  Calculator,
  FormInput,
  UserPlus,
  CreditCard,
  Wifi,
  FileText,
  Lock,
  Layers,
  Plug,
  FileSignature,
  type LucideIcon,
} from 'lucide-react';

export interface TourModuleMeta {
  key: string;
  label: string;
  icon: LucideIcon;
}

// Os 8 módulos reais do produto + FAQ e Contacto — o percurso "principal"
// do tour, navegável por scroll ou clique na sidebar. O tour não faz
// distinção entre uma página do sistema e a informação institucional,
// tudo é sistema.
export const TOUR_MODULES: TourModuleMeta[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'renting', label: 'Renting', icon: KeyRound },
  { key: 'frota', label: 'Frota', icon: Car },
  { key: 'motoristas', label: 'Motoristas', icon: User },
  { key: 'movimentacoes', label: 'Movimentações', icon: CalendarDays },
  { key: 'assistencia', label: 'Assistência', icon: Wrench },
  { key: 'crm', label: 'CRM', icon: BarChart3 },
  { key: 'marketing', label: 'Marketing', icon: Mail },
  { key: 'mais', label: 'E muito mais', icon: Sparkles },
  { key: 'faq', label: 'FAQ', icon: HelpCircle },
  { key: 'contacto', label: 'Contacto', icon: MessageCircle },
];

// Índice do separador de contacto — usado sempre que um CTA "Fale connosco"
// precisa de saltar direto para o formulário, em vez de rota própria (não
// há self-serve: a organização só é criada depois de assinar connosco).
export const CONTACT_INDEX = TOUR_MODULES.findIndex((module) => module.key === 'contacto');

// Grupo institucional — só acessível por clique (não entra no scroll
// automático do tour principal, que já tem 10 paragens), mas continua
// dentro da mesma sidebar/sistema em vez de ser um site à parte.
export const TOUR_INSTITUTIONAL_MODULES: TourModuleMeta[] = [
  { key: 'sobre', label: 'Sobre', icon: Building2 },
  { key: 'termos', label: 'Termos', icon: ScrollText },
  { key: 'privacidade', label: 'Privacidade', icon: ShieldCheck },
];

// Dados fictícios para demonstração — nenhum cliente, motorista ou valor real.

export const DASHBOARD_KPIS = [
  { label: 'Contratos ativos', value: 47, unit: 'number' as const, color: 'blue' as const },
  { label: 'Faturação do mês', value: 18420, unit: 'currency' as const, color: 'green' as const },
  { label: 'Viaturas em frota', value: 62, unit: 'number' as const, color: 'violet' as const },
  { label: 'Taxa de ocupação', value: 87, unit: 'percent' as const, color: 'amber' as const },
];

export const DASHBOARD_ATIVIDADE = [
  { periodo: 'Fev', rentabilidade: 11200, alugadas: 38, devolvidas: 31 },
  { periodo: 'Mar', rentabilidade: 13850, alugadas: 44, devolvidas: 36 },
  { periodo: 'Abr', rentabilidade: 12400, alugadas: 41, devolvidas: 40 },
  { periodo: 'Mai', rentabilidade: 15980, alugadas: 49, devolvidas: 43 },
  { periodo: 'Jun', rentabilidade: 17230, alugadas: 52, devolvidas: 47 },
  { periodo: 'Jul', rentabilidade: 18420, alugadas: 55, devolvidas: 51 },
];

export const RENTING_RENOVAR = { total: 14, atraso: 6 };

export const RENTING_CONTRATOS = [
  {
    codigo: '665',
    versao: null,
    matricula: 'BL-84-BH',
    grupo: 'Citadino Pequeno',
    estacaoEntrega: 'Prior Velho',
    dataInicio: '2026-07-22 15:00',
    dataFim: '2026-08-21 15:00',
    cliente: 'Marta Sequeira',
    condutor: 'Rui Espadinha',
    estadoOperacional: 'Agendado',
    estadoFinanceiro: 'Pendente',
    total: '175,00 €',
  },
  {
    codigo: '664',
    versao: 'v2',
    matricula: 'BL-32-RS',
    grupo: 'Carrinha Grande de Carga',
    estacaoEntrega: 'Leiria',
    dataInicio: '2026-07-17 15:46',
    dataFim: '2026-08-16 15:46',
    cliente: 'LogiPrime Transportes, Lda.',
    condutor: '—',
    estadoOperacional: 'Agendado',
    estadoFinanceiro: 'Facturado',
    total: '1623,60 €',
  },
  {
    codigo: '663',
    versao: null,
    matricula: 'BP-86-HR',
    grupo: 'Carrinha Grande de Carga',
    estacaoEntrega: 'Leiria',
    dataInicio: '2026-07-20 18:00',
    dataFim: '2026-08-19 18:00',
    cliente: 'Norteva Distribuição, Unipessoal Lda.',
    condutor: '—',
    estadoOperacional: 'Agendado',
    estadoFinanceiro: 'Facturado',
    total: '1371,45 €',
  },
  {
    codigo: '662',
    versao: 'v2',
    matricula: 'BO-47-ZC',
    grupo: 'Carrinha Média de Carga',
    estacaoEntrega: 'Leiria',
    dataInicio: '2026-07-19 18:59',
    dataFim: '2026-08-18 18:59',
    cliente: 'Triângulo Rápido, Lda.',
    condutor: '—',
    estadoOperacional: 'Em Curso',
    estadoFinanceiro: 'Facturado',
    total: '854,85 €',
  },
  {
    codigo: '661',
    versao: 'v2',
    matricula: 'BL-43-TT',
    grupo: 'Carrinha Grande de Carga',
    estacaoEntrega: 'Leiria',
    dataInicio: '2026-07-20 10:19',
    dataFim: '2026-08-19 10:19',
    cliente: 'LogiPrime Transportes, Lda.',
    condutor: '—',
    estadoOperacional: 'Em Curso',
    estadoFinanceiro: 'Facturado',
    total: '1623,60 €',
  },
  {
    codigo: '660',
    versao: null,
    matricula: 'BC-96-TU',
    grupo: 'Carrinha Pequena de Carga',
    estacaoEntrega: 'Leiria',
    dataInicio: '2026-07-19 09:30',
    dataFim: '2026-08-18 09:30',
    cliente: 'CourierPT Serviços, Lda.',
    condutor: '—',
    estadoOperacional: 'Em Curso',
    estadoFinanceiro: 'Facturado',
    total: '664,20 €',
  },
];

export const FROTA_STATS = [
  { label: 'Total de viaturas', value: 62, icon: Car, tone: 'blue' as const, highlighted: true },
  { label: 'Disponíveis', value: 18, icon: CheckCircle2, tone: 'green' as const },
  { label: 'Em uso', value: 41, icon: Navigation, tone: 'blue' as const },
  { label: 'Manutenção', value: 3, icon: Wrench, tone: 'amber' as const },
];

export const FROTA_CATEGORIAS = [
  { label: 'TVDE', value: 38, tone: 'violet' as const },
  { label: 'Rent-a-car', value: 24, tone: 'blue' as const },
];

export const FROTA_VIATURAS = [
  {
    matricula: 'AA-12-BC',
    modelo: 'Renault Clio',
    ano: 2021,
    categoria: 'TVDE',
    combustivel: 'Diesel',
    estado: 'Em contrato',
    km: '41 280 km',
    inspecao: { data: '12 ago 2026', urgente: false },
  },
  {
    matricula: 'CD-45-EF',
    modelo: 'Peugeot 208',
    ano: 2022,
    categoria: 'TVDE',
    combustivel: 'Elétrico',
    estado: 'Em contrato',
    km: '38 910 km',
    inspecao: { data: '28 jul 2026', urgente: true },
  },
  {
    matricula: 'GH-78-IJ',
    modelo: 'Dacia Sandero',
    ano: 2020,
    categoria: 'Rent-a-car',
    combustivel: 'Gasolina',
    estado: 'Disponível',
    km: '22 105 km',
    inspecao: { data: '03 nov 2026', urgente: false },
  },
  {
    matricula: 'ST-56-UV',
    modelo: 'Hyundai i20',
    ano: 2019,
    categoria: 'TVDE',
    combustivel: 'Diesel',
    estado: 'Manutenção',
    km: '55 470 km',
    inspecao: { data: '19 jul 2026', urgente: true },
  },
  {
    matricula: 'OP-34-QR',
    modelo: 'VW Polo',
    ano: 2022,
    categoria: 'Rent-a-car',
    combustivel: 'Diesel',
    estado: 'Em contrato',
    km: '29 640 km',
    inspecao: { data: '14 set 2026', urgente: false },
  },
  {
    matricula: 'ML-09-JR',
    modelo: 'Toyota Yaris',
    ano: 2023,
    categoria: 'TVDE',
    combustivel: 'Híbrido',
    estado: 'Em reserva',
    km: '9 340 km',
    inspecao: { data: '02 jan 2027', urgente: false },
  },
];

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

export const ASSISTENCIA_STATS = [
  { label: 'Por resolver', value: 12, tone: 'red' as const, highlighted: true },
  { label: 'Não atribuídos', value: 7, tone: 'amber' as const },
  { label: 'Atribuídos a mim', value: 3, tone: 'blue' as const },
  { label: 'Resolvidos hoje', value: 5, tone: 'green' as const },
];

export const ASSISTENCIA_TICKETS = [
  {
    id: '#0135',
    prioridade: 'Média',
    titulo: 'Pneu furado',
    criador: 'Diogo Marreiros',
    matricula: 'GH-78-IJ',
    responsavel: 'Sara Vilhena',
    data: '22 jul 2026',
    estado: 'Pendente de aprovação',
  },
  {
    id: '#0134',
    prioridade: 'Alta',
    titulo: 'Acidente ligeiro',
    criador: 'Nuno Palhares',
    matricula: 'CD-45-EF',
    responsavel: 'Sara Vilhena',
    data: '22 jul 2026',
    estado: 'Em curso',
  },
  {
    id: '#0133',
    prioridade: 'Baixa',
    titulo: 'Dúvida sobre recibo verde',
    criador: 'Beatriz Country',
    matricula: '—',
    responsavel: 'Não atribuído',
    data: '21 jul 2026',
    estado: 'Aberto',
  },
  {
    id: '#0132',
    prioridade: 'Média',
    titulo: 'Revisão dos 40 000 km',
    criador: 'Emanuel Sacadura',
    matricula: 'OP-34-QR',
    responsavel: 'Sara Vilhena',
    data: '21 jul 2026',
    estado: 'Resolvido',
  },
  {
    id: '#0130',
    prioridade: 'Média',
    titulo: 'Troca de viatura solicitada',
    criador: 'Rui Espadinha',
    matricula: 'ST-56-UV',
    responsavel: 'Não atribuído',
    data: '15 jul 2026',
    estado: 'Pendente de aprovação',
  },
];

interface MovimentacaoEvento {
  matricula: string;
  destino: string;
  tipo: 'entrega' | 'recolha' | 'troca' | 'interna';
}

interface MovimentacaoDia {
  dia: number;
  atual: boolean;
  eventos: MovimentacaoEvento[];
}

const evt = (matricula: string, destino: string, tipo: MovimentacaoEvento['tipo']): MovimentacaoEvento => ({
  matricula,
  destino,
  tipo,
});

// Grelha de Julho 2026 (Seg–Dom), fiel ao número de eventos/dia do
// screenshot de referência — só para dar densidade visual real ao mês.
export const MOVIMENTACOES_SEMANAS: MovimentacaoDia[][] = [
  [
    { dia: 29, atual: false, eventos: [evt('BJ-96-GM', 'Leiria', 'entrega'), evt('BS-31-NH', 'Leiria', 'recolha')] },
    { dia: 30, atual: false, eventos: [evt('BN-20-LQ', 'Leiria', 'entrega'), evt('BI-40-LC', 'Leiria', 'recolha')] },
    { dia: 1, atual: false, eventos: [evt('BS-52-PX', 'Prior Velho', 'entrega'), evt('BN-36-MG', 'Leiria', 'entrega')] },
    { dia: 2, atual: false, eventos: [evt('BN-20-NU', 'Leiria', 'entrega'), evt('BO-24-BR', 'Leiria', 'interna')] },
    { dia: 3, atual: false, eventos: [evt('BL-92-BQ', 'Leiria', 'entrega'), evt('BO-75-DF', '—', 'troca')] },
    { dia: 4, atual: false, eventos: [evt('BC-90-CT', 'Leiria', 'entrega')] },
    { dia: 5, atual: false, eventos: [evt('BL-84-BH', 'Prior Velho', 'entrega'), evt('BO-75-DF', 'Leiria', 'recolha')] },
  ],
  [
    { dia: 6, atual: false, eventos: [evt('BI-91-LC', 'Leiria', 'entrega'), evt('BO-37-LJ', '—', 'troca')] },
    { dia: 7, atual: false, eventos: [evt('BM-87-LX', 'Leiria', 'entrega'), evt('CH-16-GO', 'Prior Velho', 'recolha')] },
    { dia: 8, atual: false, eventos: [evt('BI-06-LD', 'Leiria', 'interna')] },
    { dia: 9, atual: false, eventos: [evt('BJ-66-GL', 'Leiria', 'entrega'), evt('BJ-85-GL', 'Leiria', 'recolha')] },
    { dia: 10, atual: false, eventos: [evt('BO-74-HR', 'Leiria', 'entrega'), evt('BL-30-BR', 'Prior Velho', 'recolha')] },
    { dia: 11, atual: false, eventos: [evt('BN-45-IO', 'Leiria', 'entrega')] },
    { dia: 12, atual: false, eventos: [evt('BI-87-LB', '—', 'interna')] },
  ],
  [
    { dia: 13, atual: false, eventos: [evt('BL-32-HM', 'Leiria', 'entrega')] },
    { dia: 14, atual: false, eventos: [evt('BI-82-XC', '—', 'interna')] },
    { dia: 15, atual: false, eventos: [evt('BS-76-XS', 'Leiria', 'recolha'), evt('BN-00-SG', 'V.N. Gaia', 'entrega')] },
    { dia: 16, atual: false, eventos: [evt('BO-75-DF', 'Prior Velho', 'recolha'), evt('BV-61-QO', 'Leiria', 'entrega')] },
    { dia: 17, atual: false, eventos: [evt('BL-32-RS', 'Leiria', 'entrega')] },
    { dia: 18, atual: false, eventos: [] },
    { dia: 19, atual: false, eventos: [evt('BR-51-MD', 'Açores', 'entrega'), evt('BP-14-VE', 'Açores', 'recolha')] },
  ],
  [
    { dia: 20, atual: false, eventos: [evt('BJ-22-GN', 'Prior Velho', 'entrega')] },
    { dia: 21, atual: false, eventos: [evt('BO-87-HR', 'Prior Velho', 'entrega')] },
    { dia: 22, atual: true, eventos: [evt('BO-73-DF', 'Leiria', 'recolha'), evt('BL-84-BH', 'Prior Velho', 'entrega')] },
    { dia: 23, atual: false, eventos: [evt('BJ-55-GJ', 'V.N. Gaia', 'entrega')] },
    { dia: 24, atual: false, eventos: [evt('BC-23-ZN', 'Leiria', 'recolha')] },
    { dia: 25, atual: false, eventos: [] },
    { dia: 26, atual: false, eventos: [evt('BS-13-NI', 'Leiria', 'entrega')] },
  ],
];

export const CRM_COLUNAS = [
  {
    id: 'novo',
    title: 'Novo lead',
    color: '#3b82f6',
    tasks: [
      { id: 'l1', title: 'Filipe Rasteiro', email: 'filipe.rasteiro@exemplo.pt', tags: ['Facebook Ads'] },
      { id: 'l2', title: 'Cátia Bonifácio', email: 'catia.bonifacio@exemplo.pt', tags: ['Referência'] },
    ],
  },
  {
    id: 'contacto',
    title: 'Em contacto',
    color: '#f59e0b',
    tasks: [
      { id: 'l3', title: 'Hugo Vasconcelos', email: 'hugo.v@exemplo.pt', tags: ['Site'] },
    ],
  },
  {
    id: 'aprovacao',
    title: 'Em aprovação',
    color: '#8b5cf6',
    tasks: [
      { id: 'l4', title: 'Marta Quaresma', email: 'marta.q@exemplo.pt', tags: ['Instagram'] },
      { id: 'l5', title: 'Tiago Bexiga', email: 'tiago.bexiga@exemplo.pt', tags: ['Facebook Ads'] },
    ],
  },
  {
    id: 'ativo',
    title: 'Motorista ativo',
    color: '#22c55e',
    tasks: [{ id: 'l6', title: 'Diogo Marreiros', email: 'diogo.marreiros@exemplo.pt', tags: ['Site'] }],
  },
];

export const MARKETING_TABS = ['Campanhas', 'Listas', 'Assinaturas', 'Estatísticas', 'Importar'];

export const MARKETING_CAMPANHAS = [
  {
    titulo: 'Comunicado',
    assunto: 'Recrutamento verão 2026 — vagas abertas',
    lista: 'Motoristas ativos',
    enviadoData: '30/04/2026',
    enviadoHora: '12:20',
    enviados: 237,
    erros: 1,
    estado: 'Enviado',
  },
  {
    titulo: 'Comunicado',
    assunto: 'Reativação de motoristas inativos',
    lista: 'Motoristas inativos',
    enviadoData: '13/02/2026',
    enviadoHora: '16:26',
    enviados: 62,
    erros: 0,
    estado: 'Enviado',
  },
  {
    titulo: 'Automação',
    assunto: 'Boas-vindas ao novo motorista',
    lista: 'por escolher',
    enviadoData: '—',
    enviadoHora: '',
    enviados: 0,
    erros: 0,
    estado: 'Automática',
  },
];

// O tour mostra 8 módulos — o produto tem mais. Isto alimenta o painel
// "E muito mais", que funciona como ponte entre o produto e o contacto.
export const MAIS_MODULOS = [
  { label: 'Administrativo & Faturação', icon: Calculator },
  { label: 'Formulários personalizados', icon: FormInput },
  { label: 'Convites de equipa', icon: UserPlus },
  { label: 'Cartões de frota', icon: CreditCard },
  { label: 'Dispositivos OBE', icon: Wifi },
  { label: 'Documentos & modelos', icon: FileText },
  { label: 'Permissões por cargo', icon: Lock },
  { label: 'Multi-organização', icon: Layers },
  { label: 'Integrações (Uber, Bolt, Via Verde)', icon: Plug },
  { label: 'Handover digital com assinatura', icon: FileSignature },
];
