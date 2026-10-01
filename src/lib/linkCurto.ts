/**
 * Códigos para os links curtos (`wegest.pt/r/<codigo>`).
 *
 * O código é a única credencial de quem abre o ficheiro — a função que o
 * resolve é pública, porque quem recebe o link não tem sessão. Daí os 12
 * caracteres: ~67 bits, longe do alcance de quem tente adivinhar.
 */

/** Sem 0/O e 1/l/I: estes links são ditados e copiados à mão. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const COMPRIMENTO_CODIGO = 12;

/** Base do link curto. É o domínio público da aplicação, onde vive a rota /r. */
export const BASE_LINK_CURTO = 'https://wegest.pt/r';

// 256 não é múltiplo do alfabeto, por isso um `% alfabeto` cru deixaria as
// primeiras letras sair mais vezes do que as últimas. Descartam-se os bytes
// acima do último múltiplo inteiro e o sorteio fica uniforme.
const LIMITE_SEM_ENVIESAMENTO = Math.floor(256 / ALFABETO_CODIGO.length) * ALFABETO_CODIGO.length;

export function gerarCodigoLinkCurto(): string {
  // `crypto`, não `Math.random`: um gerador previsível transformava o código
  // numa fechadura de brincar.
  let codigo = '';
  while (codigo.length < COMPRIMENTO_CODIGO) {
    const bytes = new Uint8Array(COMPRIMENTO_CODIGO);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= LIMITE_SEM_ENVIESAMENTO) continue;
      codigo += ALFABETO_CODIGO[b % ALFABETO_CODIGO.length];
      if (codigo.length === COMPRIMENTO_CODIGO) break;
    }
  }
  return codigo;
}

export function urlLinkCurto(codigo: string): string {
  return `${BASE_LINK_CURTO}/${codigo}`;
}
