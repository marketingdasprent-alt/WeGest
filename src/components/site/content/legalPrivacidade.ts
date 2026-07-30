import type { SecaoLegal } from '../primitives/BlocoLegal';
import { CONTACTO } from './institucionalContent';

// POLÍTICA DE PRIVACIDADE.
//
// A estrutura RGPD da versão anterior é mantida (responsável, dados, finalidade,
// base legal, partilha, conservação, direitos, segurança), porque estava
// correta. O que muda é o âmbito: a versão anterior descrevia a recolha de
// dados de motoristas TVDE para aluguer de viaturas — carta de condução,
// certificado TVDE, partilha com seguradoras.
//
// No contexto do software há dois papéis distintos que a versão anterior não
// separava, e que são a parte que mais importa acertar:
//
//   • dados de quem visita o site e pede contacto → a WeGest é RESPONSÁVEL;
//   • dados que os clientes introduzem na plataforma sobre os seus próprios
//     motoristas e clientes → a WeGest é SUBCONTRATANTE, e o responsável é a
//     empresa cliente.
//
// A política de cookies saiu daqui para /cookies, onde pode descrever em
// detalhe as ferramentas concretas.
//
// Como nos Termos: redigido por quem escreve software, não por um jurista.
// Precisa de revisão antes de ser tratado como definitivo.

export const PRIVACIDADE_ATUALIZADO_EM = '30 de julho de 2026';

export const PRIVACIDADE_AVISO =
  'Este documento está em revisão jurídica. Os compromissos técnicos aqui descritos correspondem ao funcionamento real do sistema; a redação legal pode ainda ser ajustada.';

export const PRIVACIDADE_SECOES: SecaoLegal[] = [
  {
    id: 'responsavel',
    titulo: 'Responsável pelo tratamento',
    paragrafos: [
      'A WeGest, com sede em Portugal, é responsável pelo tratamento dos dados pessoais recolhidos através deste website e no âmbito da contratação dos seus serviços.',
      `Para qualquer questão relativa a privacidade: ${CONTACTO.email}.`,
    ],
  },
  {
    id: 'dois-papeis',
    titulo: 'Dois papéis diferentes, consoante os dados',
    paragrafos: [
      'É importante distinguir dois conjuntos de dados, porque as responsabilidades não são as mesmas.',
    ],
    itens: [
      {
        termo: 'Dados de visitantes e potenciais clientes',
        texto:
          'quando preenche um formulário no nosso site ou nos contacta, a WeGest é a responsável pelo tratamento desses dados e esta política aplica-se integralmente.',
      },
      {
        termo: 'Dados dentro da plataforma',
        texto:
          'os dados que uma empresa cliente introduz no WeGest sobre os seus motoristas, clientes finais e contratos pertencem a essa empresa. Ela é a responsável pelo tratamento; a WeGest atua como subcontratante e trata-os apenas para prestar o serviço, seguindo as instruções do cliente. Se os seus dados estão no WeGest porque trabalha com uma empresa nossa cliente, é a essa empresa que deve dirigir os seus pedidos.',
      },
    ],
  },
  {
    id: 'dados-recolhidos',
    titulo: 'Dados que recolhemos diretamente',
    paragrafos: ['Enquanto responsáveis, recolhemos:'],
    itens: [
      {
        termo: 'Dados de contacto',
        texto:
          'nome, email, empresa e, quando o indica, a dimensão da frota — submetidos por si nos formulários do site.',
      },
      {
        termo: 'Conteúdo das comunicações',
        texto: 'as mensagens que nos envia por formulário, email ou telefone.',
      },
      {
        termo: 'Dados contratuais e de faturação',
        texto:
          'quando se torna cliente, os dados necessários ao contrato e ao cumprimento de obrigações fiscais, incluindo NIF e dados de sede.',
      },
      {
        termo: 'Dados de navegação',
        texto:
          'endereço IP, páginas visitadas e informação recolhida por cookies e tecnologias equivalentes, descritas na Política de Cookies.',
      },
    ],
  },
  {
    id: 'finalidades',
    titulo: 'Para que usamos estes dados',
    itens: [
      { texto: 'Responder a pedidos de contacto e marcar demonstrações do sistema.' },
      { texto: 'Celebrar e executar o contrato de prestação de serviços.' },
      { texto: 'Prestar suporte técnico e comunicar alterações relevantes ao serviço.' },
      { texto: 'Cumprir obrigações legais, contabilísticas e fiscais.' },
      { texto: 'Medir a eficácia do site e das campanhas, e melhorar o produto.' },
      {
        texto:
          'Enviar comunicações comerciais, quando exista consentimento — que pode retirar em qualquer momento.',
      },
    ],
  },
  {
    id: 'base-legal',
    titulo: 'Fundamento de licitude',
    itens: [
      {
        termo: 'Execução de contrato',
        texto: 'para prestar o serviço contratado e o suporte que lhe está associado.',
      },
      {
        termo: 'Obrigação legal',
        texto: 'para conservar documentos de faturação e responder a autoridades competentes.',
      },
      {
        termo: 'Consentimento',
        texto:
          'para comunicações comerciais e para cookies não essenciais. Pode ser retirado sem afetar a licitude do tratamento anterior.',
      },
      {
        termo: 'Interesse legítimo',
        texto:
          'para responder a um pedido de contacto que nos dirigiu, garantir a segurança dos sistemas e melhorar o produto.',
      },
    ],
  },
  {
    id: 'partilha',
    titulo: 'Com quem partilhamos dados',
    paragrafos: [
      'Não vendemos dados pessoais e não os cedemos para finalidades comerciais de terceiros.',
      'Recorremos a prestadores que atuam em nosso nome e apenas segundo as nossas instruções, designadamente para alojamento e base de dados, envio de email transacional, e medição do site e das campanhas. Estes prestadores estão vinculados por contrato e sujeitos a garantias adequadas de proteção de dados.',
      'Podemos ainda comunicar dados a autoridades públicas quando a lei o exija.',
    ],
  },
  {
    id: 'transferencias',
    titulo: 'Transferências para fora do Espaço Económico Europeu',
    paragrafos: [
      'Alguns prestadores podem tratar dados fora do Espaço Económico Europeu. Nesses casos, a transferência assenta em mecanismos legalmente previstos, como decisões de adequação ou cláusulas contratuais-tipo aprovadas pela Comissão Europeia.',
    ],
  },
  {
    id: 'conservacao',
    titulo: 'Durante quanto tempo guardamos os dados',
    itens: [
      {
        termo: 'Pedidos de contacto que não resultam em contrato',
        texto:
          'conservados durante o tempo necessário para a avaliação comercial e depois eliminados.',
      },
      {
        termo: 'Dados de clientes',
        texto:
          'conservados durante a vigência do contrato e, depois, pelos prazos legais aplicáveis — designadamente os prazos fiscais e de prescrição.',
      },
      {
        termo: 'Dados na plataforma',
        texto:
          'conservados enquanto o contrato do cliente vigorar. Após a cessação, o cliente pode pedir a exportação e os dados são eliminados no prazo acordado, salvo imposição legal em contrário.',
      },
    ],
  },
  {
    id: 'seguranca',
    titulo: 'Segurança',
    paragrafos: [
      'Aplicamos medidas técnicas e organizativas adequadas à proteção dos dados contra acesso não autorizado, alteração, divulgação ou destruição.',
      'Em concreto: os dados de cada organização estão isolados ao nível da própria base de dados, o acesso dentro de cada empresa é limitado por permissões por cargo, as comunicações são cifradas em trânsito, e o acesso a dados de clientes por parte da nossa equipa é restrito ao necessário para prestar suporte.',
    ],
  },
  {
    id: 'direitos',
    titulo: 'Os seus direitos',
    paragrafos: ['Nos termos do RGPD, pode exercer os seguintes direitos:'],
    itens: [
      { texto: 'Acesso aos dados pessoais que tratamos a seu respeito.' },
      { texto: 'Retificação de dados inexatos ou incompletos.' },
      { texto: 'Apagamento, quando não exista fundamento para os conservar.' },
      { texto: 'Limitação do tratamento, nos casos previstos na lei.' },
      { texto: 'Portabilidade, recebendo os dados em formato estruturado e de uso corrente.' },
      { texto: 'Oposição ao tratamento fundado em interesse legítimo.' },
      { texto: 'Retirada do consentimento, em qualquer momento.' },
      {
        texto:
          'Reclamação à Comissão Nacional de Proteção de Dados (CNPD), se entender que os seus direitos não foram respeitados.',
      },
    ],
    subsecoes: [
      {
        titulo: 'Como exercer',
        paragrafos: [
          `Basta escrever para ${CONTACTO.email}. Respondemos no prazo legal de um mês, prorrogável quando o pedido seja complexo — nesse caso informamos da prorrogação.`,
          'Se pretende eliminar uma conta de utilizador da aplicação, existe um pedido próprio para o efeito na página de eliminação de conta.',
        ],
      },
    ],
  },
  {
    id: 'alteracoes',
    titulo: 'Alterações a esta política',
    paragrafos: [
      `Esta política pode ser atualizada para refletir mudanças no serviço ou na lei. Alterações relevantes são comunicadas aos clientes. Última atualização: ${PRIVACIDADE_ATUALIZADO_EM}.`,
    ],
  },
];
