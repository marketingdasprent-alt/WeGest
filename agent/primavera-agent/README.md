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

## O que este agente NÃO faz (ainda)

Só sabe emitir **Faturas (FT)**. Fatura-Recibo, Nota de Crédito e Recibo
ainda não estão confirmados contra a documentação da AS Connect — um pedido
desses tipos falha com uma mensagem clara em vez de arriscar gerar o
documento errado. PDF e anulação de documentos também não têm endpoint
documentado — continuam a fazer-se directamente no Primavera, por agora.

## Compilar num único executável (para distribuir sem instalar Deno)

Com o Deno instalado numa máquina de build:

```
deno compile --allow-net --allow-read --output primavera-agent main.ts
```

Produz um único ficheiro (`primavera-agent.exe` no Windows) que corre sem
mais nada instalado — é isso que se entrega a cada empresa cliente.
