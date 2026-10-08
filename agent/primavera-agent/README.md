# Agente Primavera (AS Connect) — WeGest

Este programa faz a ponte entre o WeGest e o vosso Primavera. Corre dentro da
vossa rede (ao lado do servidor Primavera), e liga-se sempre **para fora** —
nunca é preciso abrir nenhuma porta, nem VPN especial, nem mexer no router.
Funciona atrás de qualquer firewall normal, tal como abrir um site.

As credenciais do Primavera (username, password, enterprise) ficam só no
ficheiro de configuração desta máquina — nunca são enviadas para o WeGest.

## 1. Preparar a configuração

Copia `primavera-agent.config.example.json` para `primavera-agent.config.json`
(mesma pasta) e preenche:

| Campo | O que é | Onde encontrar |
|---|---|---|
| `chave_agente` | a "senha" que autentica este agente ao WeGest | Admin → Faturação → Integração → Primavera, no WeGest |
| `primavera.endpoint` | o endereço local do AS Connect neste servidor | quem instalou o AS Connect sabe isto |
| `primavera.username` / `password` / `enterprise` | credenciais do AS Connect | as do PDF que a AS Connect vos deu (inicialmente o ambiente `CLONE`, para testes) |
| `iva_codes` | código interno do Primavera para cada taxa de IVA | ver secção 3 abaixo — **sem isto, a emissão falha de propósito** |

## 2. Correr

**Com o Deno instalado** (https://deno.land — um instalador, como qualquer programa):

```
deno run --allow-net --allow-read main.ts
```

**Ou, se vos foi entregue um executável já pronto** (`primavera-agent.exe` no
Windows): basta fazer duplo-clique, com o ficheiro `primavera-agent.config.json`
na mesma pasta.

Deve aparecer uma janela preta a dizer "À espera de trabalho — deixa esta
janela aberta." — é o esperado. Fica aí a correr.

## 3. Códigos de IVA — o passo que não pode ser saltado

A documentação da AS Connect mostra um exemplo com `"CodIva":"11"` — e 11%
não é nenhuma taxa de IVA portuguesa (as taxas são 0%, 6%, 13%, 23%). Isto
confirma que `CodIva` é um código **interno** do Primavera, não a
percentagem. Sem saber o código certo de cada taxa, o agente recusa-se a
emitir (de propósito — para nunca aplicar a taxa errada num documento fiscal
real). Pergunta a quem gere o Primavera qual o código interno de cada taxa
de IVA e preenche em `iva_codes`.

## 4. Deixar sempre ligado (Windows)

Sem isto, o agente pára quando a sessão fechar ou o PC reiniciar. Duas
formas simples:

- **Agendador de Tarefas do Windows**: Criar Tarefa → Disparador "Ao iniciar
  sessão" → Ação "Iniciar programa" → apontar para `primavera-agent.exe`.
- **Como serviço do Windows** (mais robusto, corre mesmo sem ninguém com
  sessão iniciada): usar o [NSSM](https://nssm.cc/) para registar o
  executável como serviço.

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

## O que este agente NÃO faz (ainda)

Só sabe emitir **Faturas (FT)**. A documentação da AS Connect de 18/09/2026
já aceita `TipoDocumento` no pedido, mas os códigos de Fatura-Recibo e Nota
de Crédito ainda não foram confirmados — um pedido desses tipos falha com uma
mensagem clara em vez de arriscar gerar o documento errado. PDF e anulação de
documentos continuam sem endpoint documentado e fazem-se directamente no
Primavera.

As credenciais do webservice nunca entram no repositório: ficam só no
`primavera-agent.config.json` desta máquina (ignorado pelo git).

## Compilar num único executável (para distribuir sem instalar Deno)

Com o Deno instalado numa máquina de build:

```
deno compile --allow-net --allow-read --output primavera-agent main.ts
```

Produz um único ficheiro (`primavera-agent.exe` no Windows) que corre sem
mais nada instalado — é isso que se entrega a cada empresa cliente.
