import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1.0.19';
import { walk } from 'jsr:@std/fs@1.0.21/walk';

const functionsRoot = new URL('../', import.meta.url);

Deno.test('imports de supabase-js têm versão exata', async () => {
  const unpinned: string[] = [];

  for await (const entry of walk(functionsRoot, { exts: ['.ts'], includeDirs: false })) {
    const source = await Deno.readTextFile(entry.path);
    if (/supabase-js@2(?:["'/?]|$)/.test(source)) unpinned.push(entry.path);
  }

  assertEquals(unpinned, []);
});

Deno.test('SheetJS em Deno usa o módulo oficial corrigido e vendorizado', async () => {
  const source = await Deno.readTextFile(new URL('../import-viaturas/index.ts', import.meta.url));
  assertStringIncludes(
    source,
    '../_shared/vendor-sheetjs/cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'
  );
  assert(!source.includes("from 'https://cdn.sheetjs.com/"));
  assert(!source.includes('npm:xlsx@0.18.5'));
});

Deno.test('cliente FTP da Via Verde usa uma versão corrigida', async () => {
  const source = await Deno.readTextFile(
    new URL('../via-verde-test-connection/index.ts', import.meta.url)
  );
  assertStringIncludes(source, 'npm:basic-ftp@5.2.1');
  assert(!source.includes('npm:basic-ftp@5.0.5'));
});
