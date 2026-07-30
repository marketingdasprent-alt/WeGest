import type { SecaoLegal } from '../primitives/BlocoLegal';
import { CONTACTO } from './institucionalContent';

// TERMOS DE UTILIZAÇÃO DO SOFTWARE — RASCUNHO.
//
// Os termos anteriores regulavam o aluguer de viatura a motoristas TVDE
// (carta de categoria B, proibição de sublocar o veículo, obrigações da
// empresa quanto ao estado do automóvel). Nada disso governa a utilização de
// software por uma empresa cliente, que é o que a landing passou a vender.
//
// ATENÇÃO: este texto foi redigido como estrutura de partida por quem escreve
// software, não por quem exerce advocacia. Tem de ser revisto por um jurista
// antes de ser tratado como vinculativo — em especial os pontos de
// responsabilidade, disponibilidade e proteção de dados. O aviso está também
// visível na própria página, para que ninguém o assuma como final.

export const TERMOS_ATUALIZADO_EM = '30 de julho de 2026';

export const TERMOS_AVISO =
  'Este documento é uma versão preliminar, em revisão jurídica. Até à publicação da versão definitiva, as condições vinculativas de cada cliente são as do contrato de prestação de serviços assinado com a WeGest, que prevalece sobre este texto.';

export const TERMOS_SECOES: SecaoLegal[] = [
  {
    id: 'objeto',
    titulo: 'Objeto',
    paragrafos: [
      'Estes termos regulam o acesso e a utilização da plataforma WeGest, um sistema de gestão para empresas de renting, aluguer de viaturas sem condutor e operações de TVDE.',
      'A WeGest é disponibilizada como serviço acessível por internet. Não é vendida nem cedida uma cópia do software: o cliente adquire o direito de a utilizar durante a vigência do seu contrato.',
    ],
  },
  {
    id: 'definicoes',
    titulo: 'Definições',
    itens: [
      { termo: 'Plataforma', texto: 'o sistema WeGest e as aplicações que lhe dão acesso.' },
      {
        termo: 'Cliente',
        texto:
          'a pessoa coletiva que contrata o serviço e em nome da qual é criada uma organização na plataforma.',
      },
      {
        termo: 'Organização',
        texto:
          'o espaço isolado de dados de cada cliente dentro da plataforma, ao qual só os seus utilizadores têm acesso.',
      },
      {
        termo: 'Utilizador',
        texto:
          'a pessoa singular a quem o cliente concede credenciais de acesso à sua organização.',
      },
      {
        termo: 'Dados do cliente',
        texto:
          'toda a informação que o cliente e os seus utilizadores introduzem ou geram na plataforma, incluindo dados de contratos, viaturas, motoristas e clientes finais.',
      },
    ],
  },
  {
    id: 'contratacao',
    titulo: 'Contratação e criação de acesso',
    paragrafos: [
      'Não existe registo automático: as organizações são criadas pela WeGest após a celebração de um contrato de prestação de serviços. Um pedido de contacto feito no site não constitui, por si, a celebração de qualquer contrato.',
      'O cliente indica quem, na sua estrutura, tem poderes para administrar a organização, criar utilizadores e definir permissões por cargo.',
    ],
  },
  {
    id: 'obrigacoes-cliente',
    titulo: 'Obrigações do cliente',
    itens: [
      {
        texto:
          'Manter a confidencialidade das credenciais de acesso e não as partilhar entre utilizadores distintos.',
      },
      {
        texto:
          'Assegurar que dispõe de fundamento legítimo para tratar na plataforma os dados pessoais que nela introduz, designadamente os de motoristas e clientes finais.',
      },
      {
        texto:
          'Utilizar a plataforma no âmbito da sua atividade e em conformidade com a lei aplicável.',
      },
      {
        texto:
          'Não tentar acessos não autorizados, não fazer engenharia inversa da plataforma nem sobrecarregar deliberadamente a infraestrutura.',
      },
      {
        texto:
          'Manter atualizada a lista de utilizadores com acesso, removendo quem deixe de o dever ter.',
      },
    ],
  },
  {
    id: 'obrigacoes-wegest',
    titulo: 'Obrigações da WeGest',
    itens: [
      { texto: 'Disponibilizar a plataforma com as funcionalidades contratadas.' },
      {
        texto:
          'Manter o isolamento dos dados de cada organização, aplicado ao nível da base de dados.',
      },
      { texto: 'Aplicar medidas técnicas e organizativas adequadas à segurança dos dados.' },
      {
        texto:
          'Prestar suporte pelos canais e nos prazos definidos no contrato de prestação de serviços.',
      },
      {
        texto:
          'Comunicar com antecedência razoável as intervenções programadas que impliquem indisponibilidade.',
      },
    ],
  },
  {
    id: 'dados',
    titulo: 'Titularidade e proteção de dados',
    paragrafos: [
      'Os dados do cliente pertencem ao cliente. A WeGest não os utiliza para finalidades próprias, não os cede a terceiros e não os usa para fins comerciais.',
      'No tratamento de dados pessoais introduzidos na plataforma, o cliente atua como responsável pelo tratamento e a WeGest como subcontratante, tratando-os apenas na medida do necessário para prestar o serviço e segundo as instruções do cliente.',
      'A Política de Privacidade descreve em detalhe que dados são tratados, com que fundamento e por quanto tempo.',
    ],
  },
  {
    id: 'disponibilidade',
    titulo: 'Disponibilidade e manutenção',
    paragrafos: [
      'A WeGest procura manter a plataforma continuamente disponível, mas não garante funcionamento ininterrupto: podem ocorrer interrupções por manutenção, falha de fornecedores de infraestrutura ou causas de força maior.',
      'Compromissos específicos de disponibilidade e tempos de resposta, quando existam, constam do contrato de prestação de serviços.',
    ],
  },
  {
    id: 'pagamento',
    titulo: 'Preço e pagamento',
    paragrafos: [
      'O serviço é remunerado em função das viaturas ativas e dos módulos contratados, nos termos e periodicidade fixados no contrato de cada cliente.',
      'A falta de pagamento pode determinar a suspensão do acesso, precedida de comunicação ao cliente, sem prejuízo da exigibilidade dos valores em dívida.',
    ],
  },
  {
    id: 'responsabilidade',
    titulo: 'Responsabilidade',
    paragrafos: [
      'A plataforma é um instrumento de apoio à gestão. As decisões de negócio, o cumprimento de obrigações legais e fiscais e a exatidão da informação introduzida são responsabilidade do cliente.',
      'Em particular, os avisos e alertas gerados pelo sistema dependem dos dados que nele foram inseridos: a WeGest não responde por prazos não cumpridos quando a informação de origem esteja ausente, desatualizada ou incorreta.',
      'Os limites de responsabilidade aplicáveis são os previstos no contrato de prestação de serviços e na lei.',
    ],
  },
  {
    id: 'vigencia',
    titulo: 'Vigência, cessação e devolução de dados',
    paragrafos: [
      'A vigência e as condições de renovação e denúncia constam do contrato de cada cliente.',
      'Cessado o contrato, o cliente pode solicitar a exportação dos seus dados em formato aberto. Decorrido o prazo de conservação acordado, os dados são eliminados, salvo quando a lei imponha a sua guarda por período mais longo.',
    ],
  },
  {
    id: 'alteracoes',
    titulo: 'Alterações a estes termos',
    paragrafos: [
      'Estes termos podem ser atualizados para refletir mudanças no serviço ou na lei. Alterações com impacto relevante nos direitos do cliente são comunicadas antes de produzirem efeitos.',
      `A data da última atualização é indicada no topo desta página: ${TERMOS_ATUALIZADO_EM}.`,
    ],
  },
  {
    id: 'lei-aplicavel',
    titulo: 'Lei aplicável e foro',
    paragrafos: [
      'Estes termos regem-se pela lei portuguesa. Para a resolução de litígios é competente o foro convencionado no contrato de prestação de serviços e, na sua falta, o que resultar da lei.',
    ],
  },
  {
    id: 'contactos',
    titulo: 'Contactos',
    paragrafos: [
      `Para questões sobre estes termos: ${CONTACTO.email} ou ${CONTACTO.telefone}. ${CONTACTO.horario}.`,
    ],
  },
];
