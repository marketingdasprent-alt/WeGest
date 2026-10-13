// Diagnóstico de ponta a ponta contra o AS Connect, numa só execução:
//   deno run --allow-net --allow-read diagnostico.ts <NIF> [preço sem IVA]
// Cria (se faltar) o cliente, emite UMA fatura de teste, confere o total no próprio
// Primavera e imprime as conclusões. Só corre em empresa de teste.

import {
  campoSemMaiusculas,
  criarClienteAsConnect,
  ehEmpresaDeTeste,
  payloadFaturaTeste,
  variantesNif,
} from './asconnect.ts';
import { carregarConfig } from './main.ts';

type Linha = Record<string, unknown>;

const conclusoes: string[] = [];

function passo(titulo: string) {
  console.log(`\n=== ${titulo} ===`);
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && !v.trim());
}

async function main() {
  const [nif, precoArg] = Deno.args;
  if (!nif) throw new Error('Uso: diagnostico.ts <NIF> [preço sem IVA]');
  const preco = Number(precoArg) || 10;

  const cfg = await carregarConfig('primavera-agent.config.json', false);
  if (!ehEmpresaDeTeste(cfg.primavera.enterprise)) {
    throw new Error(
      `Só corre em empresa de teste; "${cfg.primavera.enterprise}" não tem TEST no nome.`
    );
  }
  const as = criarClienteAsConnect(cfg);
  const { tabela, campo_codigo, campo_nif } = cfg.clientes;

  passo('1. Token');
  await as.obterToken();
  console.log(`OK (${cfg.primavera.endpoint}, ${cfg.primavera.enterprise})`);

  passo('2. Configuração');
  const faltas = [
    !cfg.artigo_por_omissao && 'artigo_por_omissao vazio',
    !cfg.iva_codes['23'] && 'iva_codes["23"] vazio',
  ].filter(Boolean);
  console.log(faltas.length ? `PROBLEMAS: ${faltas.join('; ')}` : 'OK');
  console.log(
    `clientes: ${tabela} (${campo_codigo}, ${campo_nif}); CondPag: ${cfg.condicao_pagamento}`
  );
  if (faltas.length) throw new Error('Corrige a configuração antes de continuar.');

  const lerCliente = async (): Promise<Linha | undefined> =>
    (
      await as.consultar(tabela, {
        colunas: ['*'],
        filtros: variantesNif(nif, 'PT').map((v) => ({
          field: campo_nif,
          operator: 'Equal',
          value: v,
        })),
        operadorLogico: 'OR',
        ordenarPor: campo_codigo,
        pageSize: 1,
      })
    )[0];

  passo('3. Cliente de teste');
  let cliente = await lerCliente();
  if (!cliente) {
    console.log('Não existe — a criar pelo agente...');
    await as.garantirCliente({ nif, nome: `Cliente teste WeGest ${nif}` });
    cliente = await lerCliente();
  }
  if (!cliente) throw new Error('O cliente não aparece depois de criado — ver tabela/colunas.');
  const codigo = String(campoSemMaiusculas(cliente, campo_codigo));
  console.log(
    `Código ${codigo}; CondPag=${JSON.stringify(campoSemMaiusculas(cliente, 'CondPag'))}; ` +
      `Pais=${JSON.stringify(campoSemMaiusculas(cliente, 'Pais'))}`
  );

  passo('4. Comparação com um cliente que já fatura');
  const [referencia] = await as.consultar(tabela, { ordenarPor: campo_codigo, pageSize: 1 });
  const faltamNoNovo = Object.keys(referencia ?? {}).filter(
    (k) =>
      !vazio(referencia[k]) &&
      vazio(cliente![k]) &&
      !/^(Data|Versao|Fac_|Nome|NumContrib|ContribuinteNaoResidente|CDU_|Notas|Descricao)/i.test(k)
  );
  console.log(
    faltamNoNovo.length
      ? `Preenchidos no ${campoSemMaiusculas(referencia, campo_codigo)} e vazios no de teste: ` +
          faltamNoNovo.map((k) => `${k}=${JSON.stringify(referencia[k])}`).join(', ')
      : 'Sem diferenças relevantes.'
  );

  if (vazio(campoSemMaiusculas(cliente, 'CondPag'))) {
    passo('5. Corrigir CondPag na ficha do cliente');
    try {
      await as.pedido('PUT', '/ficha/cliente/atualizar', {
        Cliente: { Codigo: codigo, CondPag: cfg.condicao_pagamento },
      });
      const depois = await lerCliente();
      const ficou = campoSemMaiusculas(depois, 'CondPag');
      console.log(`atualizar respondeu OK; CondPag agora = ${JSON.stringify(ficou)}`);
      conclusoes.push(
        vazio(ficou)
          ? 'O AS Connect IGNORA CondPag na ficha do cliente.'
          : 'O AS Connect aceita CondPag na ficha do cliente.'
      );
    } catch (erro) {
      console.log(`atualizar falhou: ${msg(erro)}`);
      conclusoes.push(`Atualizar a ficha do cliente falhou: ${msg(erro)}`);
    }
  }

  passo('6. Fatura de teste');
  let resultado: Awaited<ReturnType<typeof as.emitir>> | undefined;
  try {
    resultado = await as.emitir(payloadFaturaTeste(nif, preco));
    console.log(`Emitida: ${resultado.numero}`);
  } catch (erro) {
    console.log(`FALHOU: ${msg(erro)}`);
    conclusoes.push(`A fatura falhou: ${msg(erro)}`);
    let causa = msg(erro);
    if (!/condi[çc][ãa]o de pagamento/i.test(causa)) {
      // Pode ser um campo que mandamos e o PDF não mostra (CondPag, Descricao, Observacoes):
      // repetir só com os campos do exemplo do PDF para isolar a causa.
      try {
        const d = (await as.pedido('POST', '/documentos/vendas/inserir', {
          Documento: {
            TipoDocumento: cfg.tipos_documento.FT,
            Entidade: codigo,
            DataDoc: new Date().toISOString().slice(0, 19),
            Linhas: [
              {
                Tipo: 'Normal',
                Artigo: cfg.artigo_por_omissao,
                Quantidade: '1',
                CodIva: cfg.iva_codes['23'],
                PrecoUnit: preco,
              },
            ],
          },
        })) as { Documento?: string; Estado?: { Mensagem?: string } };
        conclusoes.push(
          `Só com os campos do PDF funciona (${d.Documento ?? d.Estado?.Mensagem}): o AS Connect ` +
            'recusa um dos campos extra (CondPag, Descricao, Referencia ou Observacoes).'
        );
      } catch (erro2) {
        conclusoes.push(`Só com os campos do PDF também falha: ${msg(erro2)}`);
        causa = msg(erro2);
      }
    }
    if (/condi[çc][ãa]o de pagamento/i.test(causa)) {
      conclusoes.push(
        'A API não deixa definir a condição de pagamento (nem no documento nem na ficha). ' +
          'Clientes que já existem com CondPag funcionam; para os novos: pedir à AS Connect ' +
          'que /ficha/cliente/inserir aceite CondPag, ou definir no Primavera a condição de ' +
          'pagamento por omissão dos clientes novos. Para já, preencher à mão a do cliente ' +
          `${codigo} e voltar a correr este diagnóstico.`
      );
    }
  }

  if (resultado) {
    passo('7. Total no Primavera');
    const esperado = Math.round(preco * 1.23 * 100) / 100;
    try {
      const [doc] = await as.consultar('CabecDoc', {
        colunas: [
          'TipoDoc',
          'Serie',
          'NumDoc',
          'Entidade',
          'TotalMerc',
          'TotalIva',
          'TotalDocumento',
        ],
        filtros: [
          { field: 'TipoDoc', operator: 'Equal', value: resultado.doctype },
          { field: 'Serie', operator: 'Equal', value: resultado.serie },
          { field: 'NumDoc', operator: 'Equal', value: Number(resultado.docnum) },
        ],
        ordenarPor: 'NumDoc',
        pageSize: 1,
      });
      console.log(JSON.stringify(doc));
      const total = Number(campoSemMaiusculas(doc, 'TotalDocumento'));
      if (Math.abs(total - esperado) < 0.01) {
        conclusoes.push(
          `Total certo (${total} = ${preco} + 23%): precos_com_iva=false está correcto.`
        );
      } else if (Math.abs(total - preco) < 0.01) {
        conclusoes.push(
          `Total ${total} = preço sem IVA: o documento espera preço COM IVA — pôr precos_com_iva=true.`
        );
      } else {
        conclusoes.push(
          `Total inesperado: ${total} (esperado ${esperado}). Ver o documento no Primavera.`
        );
      }
    } catch (erro) {
      conclusoes.push(
        `Não consegui ler o CabecDoc (${msg(erro)}) — confirmar o total à mão: ${esperado} €.`
      );
    }
  }

  passo('CONCLUSÕES');
  if (resultado) conclusoes.unshift(`Emissão OK: ${resultado.numero}.`);
  for (const c of conclusoes) console.log(`- ${c}`);
}

if (import.meta.main) {
  main().catch((erro) => {
    console.log(`\nERRO: ${msg(erro)}`);
    Deno.exit(1);
  });
}
