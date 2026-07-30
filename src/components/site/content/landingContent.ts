// Toda a copy da landing pública num só sítio. Alterar uma frase nunca deve
// obrigar a abrir JSX — quem escreve copy não devia ter de ler React.
//
// Regra de tom: cada frase responde a "porque é que isto importa para o
// gestor?". Nada de superlativos, nada de promessas que não conseguimos
// defender numa chamada.

/** Itens do "livro de atenção" — o elemento-assinatura da página. */
export interface AtencaoItem {
  /** Identificador estável: o mesmo item aparece no hero, na S2 e na S4. */
  key: string;
  /** O que precisa de atenção. */
  titulo: string;
  /** Prazo/estado — curto, cabe numa coluna. */
  prazo: string;
  /** Urgência: define a cor do marcador. */
  nivel: 'critico' | 'atencao' | 'normal';
}

export const ATENCAO_ITENS: AtencaoItem[] = [
  { key: 'contrato', titulo: 'Contrato 214 termina', prazo: '3 dias', nivel: 'critico' },
  { key: 'carta', titulo: 'Carta de condução caducada', prazo: 'há 9 dias', nivel: 'critico' },
  { key: 'inspecao', titulo: 'Inspeção 45-AB-67', prazo: '8 dias', nivel: 'atencao' },
  { key: 'parada', titulo: 'Viatura parada sem reserva', prazo: '5 dias', nivel: 'atencao' },
  { key: 'km', titulo: 'Quilómetros acima do contratado', prazo: 'a faturar', nivel: 'normal' },
];

export const HERO = {
  categoria: 'Gestão de renting e aluguer de viaturas',
  titulo: 'A sua frota deixa de depender de quem se lembra.',
  subtitulo:
    'O sistema de gestão para empresas de renting e rent-a-car. Contratos, viaturas, motoristas e faturação num só lugar — e avisos que chegam antes do problema.',
  ctaPrimario: 'Ver o WeGest em 20 minutos',
  ctaSecundario: 'Percorrer o sistema',
  ledgerTitulo: 'Precisa da sua atenção hoje',
} as const;

export const RECONHECIMENTO = {
  etiqueta: 'O que acontece hoje',
  titulo: 'A sua operação funciona. Até alguém ir de férias.',
  corpo:
    'A informação existe toda. Só não está no mesmo sítio: está no Excel de um, no WhatsApp de outro, no email de um terceiro e na cabeça de quem está há mais tempo.',
  // Discurso direto de propósito: o visitante reconhece a frase porque já a
  // disse. Bullets genéricos ("falta de visibilidade") não produzem isso.
  frases: [
    { citacao: 'O contrato acaba sexta.', remate: 'Soube na quinta.' },
    {
      citacao: 'A viatura voltou com um risco.',
      remate: 'Sem fotos da entrega, o cliente tem razão.',
    },
    { citacao: 'Está parada desde dia 4.', remate: 'Ninguém reparou.' },
    { citacao: 'A carta dele caducou em março.', remate: 'Descobriu-se numa fiscalização.' },
    { citacao: 'Faltaram os quilómetros a mais na fatura.', remate: 'Outra vez.' },
  ],
} as const;

export const CUSTO = {
  etiqueta: 'O que custa',
  titulo: 'Nada disto parece caro. É por isso que continua a acontecer.',
  corpo:
    'Cada falha custa pouco o suficiente para ser esquecida e repete-se o suficiente para pesar no ano.',
  // Aritmética que o visitante consegue verificar com os números dele. Sem
  // estatísticas inventadas — nunca teríamos como as defender.
  linhas: [
    {
      quantidade: 6,
      unidade: 'dias',
      evento: 'uma viatura parada',
      custo: 'É uma semana de renda que não volta.',
    },
    {
      quantidade: 1,
      unidade: 'dano',
      evento: 'sem prova fotográfica',
      custo: 'A franquia passa a ser sua.',
    },
    {
      quantidade: 1,
      unidade: 'renovação',
      evento: 'que ninguém lembrou',
      custo: 'É um cliente que já alugou noutro sítio.',
    },
    {
      quantidade: 1,
      unidade: 'fatura',
      evento: 'sem os extras',
      custo: 'É margem que saiu pela porta.',
    },
  ],
  remate: 'Não precisa de acreditar em nós. Faça a conta com os seus números.',
} as const;

export const MUDANCA = {
  etiqueta: 'O que muda',
  titulo: 'A diferença não é ter mais informação. É deixar de a ir buscar.',
  antesRotulo: 'Antes',
  antes: 'Você pergunta. O sistema responde — se souber onde procurar.',
  depoisRotulo: 'Depois',
  depois: 'O sistema pergunta-lhe. E só sobre o que precisa de decisão.',
} as const;

export const COMO_FUNCIONA = {
  etiqueta: 'Como funciona',
  titulo: 'Um sistema. Três movimentos.',
  passos: [
    {
      titulo: 'Entra tudo uma vez.',
      corpo:
        'Contratos, viaturas, motoristas e clientes. Uma fonte de verdade, não cinco ficheiros que ninguém sabe qual é o mais recente.',
    },
    {
      titulo: 'O sistema vigia sozinho.',
      corpo:
        'Prazos, inspeções, cartas de condução, contratos, quilómetros e faturação. Sem depender de alguém se lembrar.',
    },
    {
      titulo: 'Você decide o que importa.',
      corpo:
        'A operação chega-lhe filtrada: o que precisa de si hoje, e mais nada. O resto o sistema resolve.',
    },
  ],
} as const;

export const DEMO = {
  etiqueta: 'O sistema',
  titulo: 'Estes são os ecrãs. Não são maquetes.',
  corpo:
    'São os mesmos que a nossa equipa usa todos os dias para gerir a nossa frota. Os dados são de demonstração; os ecrãs não.',
  ctaTexto: 'Ver isto com os seus dados',
} as const;

export const AUTOMACOES = {
  etiqueta: 'Automações',
  titulo: 'O trabalho que o sistema faz enquanto não está a olhar.',
  corpo:
    'Não são relatórios que tem de ir abrir. São avisos que chegam antes de o problema existir.',
  // Afirmações temporais, não funcionalidades: o valor está no "antes".
  avisos: [
    {
      quando: '30 dias antes',
      evento: 'de o contrato acabar',
      acao: 'o comercial é avisado para renovar.',
    },
    {
      quando: '3 semanas antes',
      evento: 'de a inspeção vencer',
      acao: 'a viatura entra na lista de quem trata disso.',
    },
    {
      quando: '60 dias antes',
      evento: 'de a carta caducar',
      acao: 'o motorista e você recebem aviso.',
    },
    {
      quando: 'ao 5.º dia',
      evento: 'de viatura parada sem reserva',
      acao: 'sobe para o que precisa da sua atenção.',
    },
    {
      quando: 'no fecho do mês',
      evento: 'os quilómetros acima do contratado',
      acao: 'entram na fatura, sem ninguém somar nada.',
    },
  ],
} as const;

export const PROVA = {
  etiqueta: 'Prova',
  titulo: 'Não construímos isto para vender. Construímos para nós.',
  corpo:
    'Só depois de o sistema aguentar a nossa própria operação — TVDE e rent-a-car ao mesmo tempo — é que o abrimos a outras empresas do sector.',
  // Prova técnica: tudo aqui é verificável numa chamada. Nada aqui é
  // afirmação de marketing.
  tecnica: [
    'Dados isolados por organização na própria base de dados (RLS)',
    'Integrações com Uber, Bolt e Via Verde',
    'Handover digital de entrega e recolha, com assinatura',
    'Permissões por cargo, por módulo',
    'Multi-organização para quem gere mais do que uma empresa',
  ],
} as const;

export const OBJECOES = {
  etiqueta: 'Antes de decidir',
  titulo: 'O que costumam perguntar antes de decidir.',
  // Ordenadas por valor de conversão, não por tema: risco de migração e
  // tempo de arranque primeiro, porque são as duas objeções que travam
  // negócios. As duas primeiras ficam abertas por omissão.
  perguntas: [
    {
      pergunta: 'Preciso de migrar todos os dados de uma vez?',
      resposta:
        'Não. Pode começar só com contratos novos e ir importando o histórico — motoristas, viaturas, contratos — à medida que a equipa se habitua. Ninguém para a operação para entrar no sistema.',
    },
    {
      pergunta: 'Quanto tempo demora a pôr a equipa a usar isto?',
      resposta:
        'A maioria das equipas fica operacional num dia. Damos apoio direto no arranque, e a navegação segue a lógica dos ecrãs que percorreu nesta página.',
    },
    {
      pergunta: 'Como é que se cobra?',
      resposta:
        'Por viatura ativa e pelos módulos que ligar — não paga o que não usa. Não temos tabela pública porque o número muda com o tamanho da frota e com os módulos: dizemos-lhe o valor na primeira chamada, e por escrito no dia seguinte.',
    },
    {
      pergunta: 'Consigo ativar só os módulos de que preciso?',
      resposta:
        'Sim. Frota, Renting, Assistência e Marketing ligam-se por organização. Não vê nem paga módulos que não usa.',
    },
    {
      pergunta: 'Os meus dados ficam isolados de outras empresas?',
      resposta:
        'Sim, ao nível da base de dados (RLS). Nenhuma consulta consegue ver dados de outra empresa, mesmo partilhando o mesmo sistema.',
    },
    {
      pergunta: 'Serve para rent-a-car ou só para TVDE?',
      resposta:
        'Os dois, ao mesmo tempo. Nasceu a gerir renting, rent-a-car e TVDE em simultâneo — a mesma viatura pode estar num contrato de renting hoje e num aluguer amanhã, sem sair do sistema.',
    },
    {
      pergunta: 'Há suporte incluído?',
      resposta:
        'Sim, por email e pelo módulo de Assistência dentro do próprio sistema — o mesmo que viu acima, com prioridades e SLA.',
    },
  ],
} as const;

/** Quantas objeções ficam abertas por omissão (as de maior valor). */
export const OBJECOES_ABERTAS = 2;

export const CTA_FINAL = {
  etiqueta: 'Falar connosco',
  titulo: 'Vamos ver a sua operação, não a nossa demo.',
  corpo:
    'Vinte minutos. Mostramos o sistema com os seus casos: os contratos que tem, as viaturas que tem, o Excel que já usa. Se não fizer sentido para si, dizemos-lhe.',
  // Expectativas explícitas reduzem o atrito mais do que qualquer botão
  // bonito: o visitante hesita porque não sabe no que se está a meter.
  expectativas: [
    'Respondemos em 1 dia útil.',
    'Falamos com quem construiu o sistema, não com um call center.',
    'Sem compromisso e sem cartão.',
  ],
  botao: 'Marcar os 20 minutos',
  botaoAEnviar: 'A enviar…',
  sucesso: 'Recebido. Respondemos em 1 dia útil.',
  jaCliente: 'Já é cliente? Entrar',
} as const;

/** Opções do único campo de qualificação do formulário — um clique, não prosa. */
export const OPCOES_VIATURAS = [
  '1 a 10 viaturas',
  '11 a 30 viaturas',
  '31 a 100 viaturas',
  'Mais de 100 viaturas',
] as const;
