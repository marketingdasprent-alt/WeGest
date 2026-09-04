import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validarAnexosSubmissao, TI_ANEXO_MAX_BYTES, TI_ANEXO_MAX_FICHEIROS } from './anexos.ts';

// btoa(texto) directo só funciona para ASCII — 'á' é multi-byte em UTF-8, e
// btoa trata a string como code units, não como bytes. Codifica primeiro
// para bytes UTF-8 (o que um ficheiro real tem), só depois para base64 —
// mesmo caminho que um ficheiro carregado pelo browser segue de verdade.
function base64De(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

Deno.test('sem anexos (undefined) é válido — devolve lista vazia', () => {
  const result = validarAnexosSubmissao(undefined);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.data.length, 0);
});

Deno.test('sem anexos (null) é válido — devolve lista vazia', () => {
  const result = validarAnexosSubmissao(null);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.data.length, 0);
});

Deno.test('rejeita algo que não é uma lista', () => {
  assertEquals(validarAnexosSubmissao('nao-e-lista').ok, false);
  assertEquals(validarAnexosSubmissao({}).ok, false);
});

Deno.test(`rejeita mais de ${TI_ANEXO_MAX_FICHEIROS} ficheiros`, () => {
  const anexos = Array.from({ length: TI_ANEXO_MAX_FICHEIROS + 1 }, (_, i) => ({
    nome: `f${i}.png`,
    mimeType: 'image/png',
    conteudoBase64: base64De('conteudo'),
  }));
  const result = validarAnexosSubmissao(anexos);
  assertEquals(result.ok, false);
});

Deno.test(`aceita exactamente ${TI_ANEXO_MAX_FICHEIROS} ficheiros`, () => {
  const anexos = Array.from({ length: TI_ANEXO_MAX_FICHEIROS }, (_, i) => ({
    nome: `f${i}.png`,
    mimeType: 'image/png',
    conteudoBase64: base64De('conteudo'),
  }));
  const result = validarAnexosSubmissao(anexos);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.data.length, TI_ANEXO_MAX_FICHEIROS);
});

Deno.test('rejeita item sem nome, mimeType ou conteudoBase64', () => {
  assertEquals(
    validarAnexosSubmissao([{ mimeType: 'image/png', conteudoBase64: base64De('x') }]).ok,
    false
  );
  assertEquals(
    validarAnexosSubmissao([{ nome: 'a.png', conteudoBase64: base64De('x') }]).ok,
    false
  );
  assertEquals(validarAnexosSubmissao([{ nome: 'a.png', mimeType: 'image/png' }]).ok, false);
});

Deno.test('rejeita nome vazio ou só espaços', () => {
  assertEquals(
    validarAnexosSubmissao([{ nome: '  ', mimeType: 'image/png', conteudoBase64: base64De('x') }])
      .ok,
    false
  );
});

Deno.test('rejeita tipo de ficheiro não suportado', () => {
  const result = validarAnexosSubmissao([
    { nome: 'script.exe', mimeType: 'application/x-msdownload', conteudoBase64: base64De('x') },
  ]);
  assertEquals(result.ok, false);
});

Deno.test('rejeita base64 inválido', () => {
  const result = validarAnexosSubmissao([
    { nome: 'a.png', mimeType: 'image/png', conteudoBase64: '***nao e base64***' },
  ]);
  assertEquals(result.ok, false);
});

Deno.test('rejeita ficheiro que excede o limite de tamanho', () => {
  // Um caracter por byte decodificado — mais barato que gerar base64 real de
  // um ficheiro grande, e testa exactamente o limite que a função aplica.
  const conteudoGrande = 'a'.repeat(TI_ANEXO_MAX_BYTES + 1);
  const result = validarAnexosSubmissao([
    { nome: 'grande.png', mimeType: 'image/png', conteudoBase64: base64De(conteudoGrande) },
  ]);
  assertEquals(result.ok, false);
});

Deno.test('aceita ficheiro exactamente no limite de tamanho', () => {
  const conteudoNoLimite = 'a'.repeat(TI_ANEXO_MAX_BYTES);
  const result = validarAnexosSubmissao([
    { nome: 'no-limite.png', mimeType: 'image/png', conteudoBase64: base64De(conteudoNoLimite) },
  ]);
  assertEquals(result.ok, true);
});

Deno.test('descodifica correctamente o conteúdo e recorta o nome', () => {
  const result = validarAnexosSubmissao([
    { nome: '  foto.png  ', mimeType: 'image/png', conteudoBase64: base64De('olá') },
  ]);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data[0].nome, 'foto.png');
    assertEquals(result.data[0].mimeType, 'image/png');
    assertEquals(new TextDecoder().decode(result.data[0].bytes), 'olá');
  }
});

Deno.test('todos os tipos de MIME documentados são aceites', () => {
  const tipos = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ];
  for (const mimeType of tipos) {
    const result = validarAnexosSubmissao([{ nome: 'f', mimeType, conteudoBase64: base64De('x') }]);
    assertEquals(result.ok, true, `esperava aceitar ${mimeType}`);
  }
});
