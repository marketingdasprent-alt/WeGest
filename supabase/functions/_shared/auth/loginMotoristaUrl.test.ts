import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { urlLoginMotorista } from './loginMotoristaUrl.ts';

const RAIZ = 'https://wegest.pt/motorista/login';

Deno.test('decada usa o domínio raiz', () => {
  assertEquals(urlLoginMotorista('decada'), RAIZ);
  assertEquals(urlLoginMotorista('  DECADA '), RAIZ);
});

Deno.test('outro código usa o subdomínio', () => {
  assertEquals(urlLoginMotorista('sul'), 'https://sul.wegest.pt/motorista/login');
  assertEquals(urlLoginMotorista('Distancia-1'), 'https://distancia-1.wegest.pt/motorista/login');
});

Deno.test('código ausente ou inválido cai no domínio raiz', () => {
  for (const codigo of [null, undefined, '', '   ', 'a.b', 'x/evil', 'a b', 'ev il.com#']) {
    assertEquals(urlLoginMotorista(codigo), RAIZ);
  }
});

Deno.test('appUrl https tem prioridade e perde a barra final', () => {
  assertEquals(
    urlLoginMotorista('sul', 'https://app.exemplo.pt/'),
    'https://app.exemplo.pt/motorista/login'
  );
  assertEquals(
    urlLoginMotorista('sul', 'https://app.exemplo.pt///'),
    'https://app.exemplo.pt/motorista/login'
  );
});

Deno.test('appUrl que não é https é ignorado', () => {
  for (const appUrl of [
    'http://app.exemplo.pt',
    'javascript:alert(1)',
    'app.exemplo.pt',
    '',
    'ftp://x',
  ]) {
    assertEquals(urlLoginMotorista('sul', appUrl), 'https://sul.wegest.pt/motorista/login');
  }
});
