# Agente Primavera (AS Connect) — WeGest

Este programa faz a ponte entre o WeGest e o vosso Primavera. Corre dentro da
vossa rede (de preferência no próprio servidor do AS Connect) e liga-se sempre
**para fora** — nunca é preciso abrir nenhuma porta, nem VPN especial, nem
mexer no router.

As credenciais do Primavera (username, password, enterprise) ficam só no
ficheiro de configuração desta máquina — nunca são enviadas para o WeGest nem
guardadas no repositório.

## 1. Preparar a configuração

Copia `primavera-agent.config.example.json` para `primavera-agent.config.json`
(mesma pasta) e preenche:

| Campo                                            | O que é                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `chave_agente`                                   | a "senha" que autentica este agente ao WeGest — Admin → Faturação → Integração → Primavera         |
| `primavera.endpoint`                             | endereço do AS Connect. No próprio servidor: `http://localhost:8090`                               |
| `primavera.username` / `password` / `enterprise` | credenciais do PDF da AS Connect (`DASPWSTEST` é o ambiente de testes)                             |
| `tipos_documento`                                | tipo do WeGest → tipo do Primavera. A fatura é `FA` (PDF de 18-09)                                 |
| `artigo_por_omissao`                             | artigo do Primavera usado nas linhas — o WeGest não manda artigo próprio                           |
| `iva_codes`                                      | código interno do Primavera para cada taxa de IVA                                                  |
| `precos_com_iva`                                 | `true` se o documento do Primavera espera o preço já com IVA (omissão `false`)                     |
| `clientes`                                       | tabela e colunas onde se procura o cliente pelo NIF                                                |
| `condicao_pagamento`                             | `CondPag` do Primavera para clientes novos e documentos (omissão `"1"`, a dos clientes existentes) |

## 2. Descobrir os valores no próprio Primavera

Antes de ligar ao WeGest, testa e consulta directamente o AS Connect
(estes comandos não precisam da `chave_agente`):

```
deno run --allow-net --allow-read main.ts --testar
deno run --allow-net --allow-read main.ts --consultar ASC_Artigos 50 artigo
deno run --allow-net --allow-read main.ts --consultar Clientes 3 Cliente
deno run --allow-net --allow-read main.ts --consultar Iva 20 Iva
```

- `--testar` pede o token e lê uma linha de artigos. Se `artigo_por_omissao`
  estiver preenchido, confirma também que esse artigo existe.
- `--consultar <Tabela> [linhas]` mostra as linhas tal como o AS Connect as
  devolve. O terceiro argumento é a coluna por onde ordenar — o AS Connect
  recusa limitar linhas sem ordenação. Lê tanto as views `ASC_…` como as
  tabelas nativas do Primavera (`Clientes`, `Iva`).

Valores confirmados no `DASPWSTEST` (2026-10-13): artigo `AL` (Aluguer
Viaturas); IVA do Continente `06`, `13`, `23`; clientes em `Clientes`
(`Cliente`, `NumContrib`). O código de IVA para 0% depende do motivo de
isenção (`00` M99, `01` M07, `03` M05) — decidir com a contabilidade.

### Fatura de teste

```
deno run --allow-net --allow-read main.ts --fatura-teste 123456789 10
```

Emite uma fatura de uma linha (artigo por omissão, 23%, 10 € sem IVA) para o
NIF indicado, criando o cliente se não existir. **Só corre se o `enterprise`
tiver "TEST" no nome** — nunca suja a faturação real. Confirmar no Primavera
que o total é 12,30 €.

## 3. Códigos de IVA — o passo que não pode ser saltado

`CodIva` é um código **interno** do Primavera, não a percentagem (o exemplo
do PDF usa `"11"`). Sem o código de cada taxa, o agente recusa emitir — de
propósito, para nunca aplicar a taxa errada num documento fiscal.

## 4. Como o agente emite uma fatura

1. Procura o cliente pelo NIF em `clientes.tabela`, com e sem o prefixo do
   país (o Primavera guarda os estrangeiros como `BR258209887`).
2. Se não existir, cria-o em `/ficha/cliente/inserir` com **código = NIF** e
   grava a `condicao_pagamento` com `/ficha/cliente/atualizar` (o inserir
   ignora-a e, sem ela, o Primavera recusa a fatura).
3. Insere o documento em `/documentos/vendas/inserir` com o `TipoDocumento`
   configurado, o código do cliente como `Entidade` e uma linha por item.

O preço vai em `PrecoUnit` **sem IVA**. Confirmar na primeira fatura de teste
(`DASPWSTEST`) que o total sai com o IVA somado — se sair igual ao preço, o
documento do Primavera está configurado com preços com IVA incluído e é
preciso pôr `precos_com_iva: true`.

## 5. Correr e deixar sempre ligado

```
deno run --allow-net --allow-read main.ts
```

Ou o executável compilado (`primavera-agent.exe`), com o
`primavera-agent.config.json` na mesma pasta. Deve aparecer "À espera de
trabalho — deixa esta janela aberta."

Para não parar quando a sessão fecha ou o servidor reinicia:

- **Agendador de Tarefas**: Criar Tarefa → Disparador "Ao iniciar o
  computador" → Ação "Iniciar programa" → `primavera-agent.exe`.
- **Serviço do Windows** (mais robusto): registar o executável com o
  [NSSM](https://nssm.cc/).

## Uma empresa, um agente

A chave do agente identifica **uma** integração de faturação, ou seja, uma
empresa emissora (no Primavera, uma `enterprise`). Com duas empresas na mesma
organização correm dois agentes, cada um com a sua chave e o seu ficheiro de
configuração. Um agente só recebe os pedidos da sua empresa.

## Quando o resultado é "ambíguo"

Se o pedido saiu para o Primavera e a resposta não chegou (rede caiu, o
servidor respondeu com erro interno, ou sem forma reconhecível), o agente
**não** diz "falhou": diz "ambíguo". O WeGest guarda esse estado e não volta
a emitir sozinho, porque o documento pode já existir no Primavera. Alguém
confirma lá e resolve à mão. O mesmo acontece se o agente ficar mais de
2 minutos sem responder a um pedido que reclamou.

## "Não executado: o WeGest já tinha deixado de esperar"

O WeGest espera 45 s por cada fatura, contados desde que cria o pedido. Um
pedido que chegue ao agente com mais de 30 s não é executado, e o envio do
documento ao Primavera tem de acabar até aos 43 s (com menos de 8 s de margem
nem se envia). Nestes casos nada foi enviado ao Primavera: é seguro emitir de
novo no WeGest (se ele o recusar, marcar o alerta como resolvido em Automação).

## O que este agente NÃO faz (ainda)

Só emite **Faturas**. Fatura-Recibo, Nota de Crédito e Recibo não têm códigos
nem regras confirmados; linhas com desconto, consumidor final, PDF e anulação
também não estão documentados pela AS Connect — falham com uma mensagem clara
em vez de arriscar um documento errado.

## Compilar num único executável

```
deno compile --allow-net --allow-read --output primavera-agent main.ts
```
