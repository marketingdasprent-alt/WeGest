// Conteúdo das páginas institucionais. Mesma regra da landing: a copy vive
// fora do JSX.

/**
 * Contactos reais, num só sítio.
 *
 * `email` é o mesmo destino que a edge function `contact-inquiry` usa
 * (CONTACT_INQUIRY_EMAIL) — os pedidos do site e os emails diretos chegam à
 * mesma caixa, o que evita leads perdidos numa caixa que ninguém lê.
 *
 * A versão anterior da página de Contactos mostrava
 * `motoristas.tvde@rotaliquida.pt` mas o link enviava para
 * `motoristas.tvde@distanciaarrojada.pt` — domínios diferentes no texto e no
 * href. Manter isto centralizado torna essa divergência impossível.
 */
export const CONTACTO = {
  email: 'marketing@dasprent.pt',
  telefone: '309 100 174',
  telefoneHref: '+351309100174',
  horario: 'Segunda a sexta, 9h00 às 18h00',
  resposta: 'Respondemos em 1 dia útil.',
} as const;

export const SOBRE = {
  etiqueta: 'Sobre',
  titulo: 'Construímos isto para nós antes de o vender a alguém.',
  descricao:
    'A WeGest não começou como um produto. Começou como a solução para um problema que era nosso: gerir renting, rent-a-car e TVDE ao mesmo tempo, sem perder contratos, viaturas nem prazos pelo caminho.',
  // A história substitui a "missão/valores" genérica que a página tinha antes
  // (Parceria, Transparência, Excelência, Compromisso — quatro palavras que
  // qualquer empresa do mundo pode assinar, logo não dizem nada).
  capitulos: [
    {
      titulo: 'O problema era nosso',
      paragrafos: [
        'Geríamos uma frota própria em renting, aluguer e TVDE. A informação existia toda — só estava dividida entre folhas de Excel, conversas de WhatsApp, caixas de email e a memória de quem estava há mais tempo na empresa.',
        'Funcionava. Até alguém ir de férias, ou até um contrato acabar sem ninguém dar por isso.',
      ],
    },
    {
      titulo: 'Testámos o sistema na nossa própria operação',
      paragrafos: [
        'Construímos o WeGest para resolver isso e passámos a correr a nossa operação inteira nele: contratos, viaturas, motoristas, entregas e recolhas, assistência, danos e faturação.',
        'Cada função existe porque nos faltou primeiro. Nada aqui foi desenhado numa apresentação — foi desenhado num dia em que algo correu mal.',
      ],
    },
    {
      titulo: 'Só depois o abrimos a outras empresas',
      paragrafos: [
        'Quando o sistema já aguentava a nossa operação, outras empresas do sector pediram para o usar. É isso que hoje disponibilizamos.',
        'Continuamos a ser utilizadores do nosso próprio produto todos os dias, o que tem uma consequência prática: quando algo está mal, somos os primeiros a sentir.',
      ],
    },
  ],
  // Compromissos verificáveis, em vez de valores abstratos. Cada um destes
  // pode ser confirmado numa chamada — e é isso que os torna úteis.
  compromissosTitulo: 'O que isto significa na prática',
  compromissos: [
    'Falamos com quem construiu o sistema, não com um intermediário comercial.',
    'Cada organização tem os dados isolados na própria base de dados.',
    'Não há migração obrigatória: entra-se pelos contratos novos e importa-se o histórico ao ritmo da equipa.',
    'Se o WeGest não servir para o seu caso, dizemos antes de assinar.',
  ],
  ctaTitulo: 'Quer ver o sistema com os seus casos?',
  ctaTexto: 'Falar connosco',
} as const;

export const CONTACTOS = {
  etiqueta: 'Contactos',
  titulo: 'Fale com quem construiu o sistema.',
  descricao:
    'Sem call center e sem formulário de qualificação em três passos. Escolha o canal que preferir — chega sempre à mesma equipa.',
  // O formulário da landing continua a ser o caminho principal; esta página
  // existe para quem prefere email ou telefone, e para quem chega por SEO a
  // procurar "contactos wegest".
  formularioTitulo: 'Prefere que lhe liguemos?',
  formularioTexto:
    'O formulário na página inicial marca uma demonstração de 20 minutos com os seus dados.',
  formularioCta: 'Marcar os 20 minutos',
} as const;

export const FAQ_PAGINA = {
  etiqueta: 'Perguntas frequentes',
  titulo: 'Tudo o que costumam perguntar antes de decidir.',
  descricao:
    'As dúvidas que aparecem sempre nas primeiras conversas. Se a sua não estiver aqui, pergunte — respondemos em 1 dia útil.',
  // Estas juntam-se às objeções da landing (OBJECOES), que já cobrem migração,
  // arranque, preço, módulos, isolamento de dados, âmbito e suporte.
  extra: [
    {
      pergunta: 'A minha equipa consegue usar isto no telemóvel?',
      resposta:
        'Sim. O WeGest funciona no browser e tem aplicação instalável para Android e iOS — as entregas, recolhas e registos de danos com fotografias são feitos no telemóvel, no local, e não numa secretária no dia seguinte.',
    },
    {
      pergunta: 'Consigo exportar os meus dados se sair?',
      resposta:
        'Sim. Os dados são seus. A qualquer momento pode pedir a exportação dos contratos, viaturas, motoristas e movimentos em formato aberto, e mantemos essa possibilidade também na cessação do contrato.',
    },
    {
      pergunta: 'Trabalham com quem tem mais do que uma empresa?',
      resposta:
        'Sim. O sistema é multi-organização: cada empresa tem os seus dados isolados, e quem gere várias troca entre elas sem sair da sessão nem repetir o login.',
    },
    {
      pergunta: 'O sistema emite faturas ou fala com o meu programa de faturação?',
      resposta:
        'O módulo Administrativo trata contratos, recibos e notas de crédito dentro do sistema. Para casos em que a faturação tem de sair do seu programa atual, falamos sobre o que faz sentido integrar — depende do programa que usa.',
    },
    {
      pergunta: 'Quem tem acesso a quê dentro da minha empresa?',
      resposta:
        'Define-o por cargo. Cada cargo vê apenas os módulos e ações que lhe atribuir — um mecânico não precisa de ver margens de contratos, e um comercial não precisa de aceder a dados de assistência.',
    },
  ],
  contactoTitulo: 'Ficou com uma dúvida que não está aqui?',
} as const;
