import type { SecaoLegal } from '../primitives/BlocoLegal';
import { CONTACTO } from './institucionalContent';

// POLÍTICA DE COOKIES.
//
// Escrita a partir do que o código realmente carrega, e não de uma lista
// genérica de categorias:
//
//   • Google Tag Manager — em index.html, contentor GTM-MTLGMGPK, carrega em
//     todas as páginas.
//   • Meta (Facebook) Pixel — src/lib/pixel.ts, id 1212569624343076. Lazy:
//     só é carregado quando uma página pública o pede explicitamente
//     (landing, formulário público). Nunca no backoffice autenticado.
//   • Sessão — o cliente Supabase corre com `persistSession: true` e o
//     armazenamento por omissão, que é o localStorage do browser. Não é um
//     cookie, e a página di-lo em vez de fingir o contrário.
//
// Se algum destes deixar de existir (ou se um novo entrar), esta lista tem de
// ser atualizada com ele.

export const COOKIES_ATUALIZADO_EM = '30 de julho de 2026';

export const COOKIES_SECOES: SecaoLegal[] = [
  {
    id: 'o-que-sao',
    titulo: 'O que são cookies',
    paragrafos: [
      'Cookies são ficheiros de texto que um site guarda no seu dispositivo para o reconhecer entre páginas e visitas. Servem para manter uma sessão iniciada, medir a utilização do site e, no caso da publicidade, atribuir resultados a campanhas.',
      'Esta página descreve concretamente o que o site da WeGest utiliza, e não apenas as categorias possíveis.',
    ],
  },
  {
    id: 'essenciais',
    titulo: 'Estritamente necessários',
    paragrafos: [
      'Permitem o funcionamento básico do site e da aplicação. Sem eles não é possível iniciar sessão nem manter-se autenticado.',
    ],
    itens: [
      {
        termo: 'Sessão de utilizador',
        texto:
          'a sua sessão autenticada é guardada no armazenamento local do browser (localStorage), não num cookie. É apagada quando termina a sessão ou limpa os dados do browser.',
      },
      {
        termo: 'Preferência de tema',
        texto:
          'guardamos localmente a escolha entre modo claro e escuro, para que a página não mude de aspeto a cada visita.',
      },
    ],
  },
  {
    id: 'medicao',
    titulo: 'Medição e desempenho',
    paragrafos: [
      'Usamos o Google Tag Manager para carregar e gerir as ferramentas de medição do site. Permite-nos saber que páginas são vistas e onde os visitantes abandonam — informação que usamos para melhorar o site, não para identificar pessoas individualmente.',
    ],
    itens: [
      {
        termo: 'Google Tag Manager',
        texto:
          'contentor de etiquetas que carrega as ferramentas de medição. Responsável: Google Ireland Limited.',
      },
    ],
  },
  {
    id: 'marketing',
    titulo: 'Publicidade e atribuição',
    paragrafos: [
      'O Meta Pixel mede o resultado das campanhas que fazemos no Facebook e no Instagram — por exemplo, saber se um pedido de contacto veio de um anúncio.',
      'É carregado apenas nas páginas públicas do site, e de forma diferida: dentro da aplicação autenticada nunca é carregado, para que a utilização do sistema pelos nossos clientes não seja comunicada a terceiros.',
    ],
    itens: [
      {
        termo: 'Meta Pixel',
        texto:
          'cookies de atribuição publicitária, como _fbp. Responsável: Meta Platforms Ireland Limited.',
      },
    ],
  },
  {
    id: 'gestao',
    titulo: 'Como controlar ou eliminar cookies',
    paragrafos: [
      'Pode bloquear ou apagar cookies nas definições do seu browser. Todos os browsers atuais permitem recusar cookies de terceiros, apagar os já guardados ou navegar em modo privado.',
      'Bloquear cookies estritamente necessários impede o funcionamento da área autenticada. Bloquear os de medição e publicidade não afeta a utilização do site.',
      'Pode também limitar a publicidade personalizada diretamente nas definições da sua conta Meta e nas definições de anúncios da Google.',
    ],
  },
  {
    id: 'alteracoes',
    titulo: 'Alterações a esta política',
    paragrafos: [
      `Atualizamos esta página quando entra ou sai uma ferramenta que utilize cookies. Última atualização: ${COOKIES_ATUALIZADO_EM}.`,
    ],
  },
  {
    id: 'contactos',
    titulo: 'Contactos',
    paragrafos: [
      `Para questões sobre cookies ou sobre o tratamento dos seus dados: ${CONTACTO.email}.`,
    ],
  },
];
