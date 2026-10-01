# api.wegest.pt (Cloudflare Worker)

A API externa de rent-a-car passa a viver em `https://api.wegest.pt/v1`. Este Worker recebe
`https://api.wegest.pt/v1/*` e faz fetch a
`https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1/*`, com o mesmo
método, query e corpo. Só seguem os cabeçalhos `X-API-Key`, `Authorization`, `Content-Type`,
`Accept`, `Accept-Encoding`, `Origin`, `User-Agent` e os de preflight CORS. Devolve a resposta
tal qual, menos o `Set-Cookie`, e não guarda nada em cache.

**Porquê:** pelo rewrite da Vercel (`wegest.pt/api/rent-a-car`), a firewall da Vercel desafia
rajadas de pedidos. Num teste de 70 pedidos em 20 s vieram 19 respostas 200 e 51 respostas 403
"Vercel Security Checkpoint". Pela URL directa do Supabase vieram 70 respostas 200. O DNS de
wegest.pt já está no Cloudflare, por isso o Worker fica à frente sem passar pela Vercel.

| Pedido                 | Resposta                                             |
| ---------------------- | ---------------------------------------------------- |
| `GET /`                | `{ nome, versao, documentacao }` (do próprio Worker) |
| `/v1` e `/v1/*`        | o que a edge function responder                      |
| qualquer outro caminho | `404 { "erro": { "codigo": "NAO_ENCONTRADO", … } }`  |
| corpo acima de 64 KiB  | `413 { "erro": { "codigo": "CORPO_INVALIDO", … } }`  |
| origem em baixo        | `502 { "erro": { "codigo": "ERRO_INTERNO", … } }`    |

Testes: `pnpm vitest run cloudflare` (também correm no `pnpm test` do CI).

## Publicar pelo painel do Cloudflare

1. **Criar o Worker.** Workers & Pages → Create → Create Worker → nome `api-wegest` → Deploy.
2. **Colar o código.** No Worker, Edit code → apagar o exemplo → colar `worker.js` inteiro →
   Deploy. Não há variáveis nem segredos a configurar.
3. **Ligar o domínio.** Escolher uma das duas opções.
   - **Custom Domain (recomendado):** no Worker, Settings → Domains & Routes → Add → Custom
     Domain → `api.wegest.pt`. O Cloudflare cria o registo DNS e o certificado sozinho.
   - **Rota:** Settings → Domains & Routes → Add → Route → `api.wegest.pt/*`, zona
     `wegest.pt`. Depois, em DNS → Records, criar `AAAA` com nome `api` e conteúdo `100::`,
     com Proxy status **Proxied** (nuvem laranja). Sem proxy, a rota nunca dispara.
   - **Fechar os outros endereços do Worker:** Settings → Domains & Routes → `workers.dev` →
     **Disable**, e Preview URLs → **Disable**. Assim só se chega ao Worker por `api.wegest.pt`.
4. **Desligar o desafio a bots só em api.wegest.pt e pôr um limite de pedidos.** Os pedidos vêm
   do backend do site, não de um browser, e um desafio parte a integração.
   - Rules → Configuration Rules → Create rule → _Hostname equals `api.wegest.pt`_ →
     **Security Level: Essentially Off** e **Browser Integrity Check: Off** → Deploy.
   - Em plano Pro ou superior (Super Bot Fight Mode): Security → WAF → Custom rules → _Hostname
     equals `api.wegest.pt`_ → acção **Skip** → marcar Super Bot Fight Mode (e as regras
     geridas que estejam a desafiar).
   - **Rate limiting:** Security → WAF → Rate limiting rules → Create rule (o plano Free tem 1)
     → _Hostname equals `api.wegest.pt`_ → contar **por IP** → **300 pedidos em 10 s** → acção
     **Block** durante **10 s** → Deploy.
   - **Plano Workers:** confirmar em Workers & Pages → Plans qual é. O Free tem um tecto de
     100 000 pedidos/dia por conta (acima disso o Worker recusa); o Paid não. Ligar o alerta de
     uso de Workers em Notifications → Add.
5. **Testar.**

   ```bash
   curl -s https://api.wegest.pt/
   curl -s https://api.wegest.pt/v1
   curl -s https://api.wegest.pt/v1/health -H "X-API-Key: wg_ra_..."
   # Rajada: 70 pedidos em ~20 s têm de dar todos 200 (sem 403 de desafio)
   for i in $(seq 70); do curl -s -o /dev/null -w "%{http_code}\n" \
     https://api.wegest.pt/v1/health -H "X-API-Key: wg_ra_..."; done | sort | uniq -c
   # Acima do limite: mais de 300 pedidos em 10 s têm de começar a dar 429 da Cloudflare
   seq 400 | xargs -P 50 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
     https://api.wegest.pt/v1/health -H "X-API-Key: wg_ra_..." | sort | uniq -c
   ```

   Se o teste do passo 5 der desafios em plano Free, **NÃO** desligar o Bot Fight Mode da zona.
   Primeiro confirmar em DNS que nenhum outro registo está proxied. Se houver, usar o URL directo
   do Supabase ou subir para Pro e usar a regra Skip do Super Bot Fight Mode só neste host.
   Decisão do responsável da conta.

## A whitelist de IP não é fiável por este caminho

O pedido chega à edge function vindo do Cloudflare. O IP que a função vê é do Cloudflare,
não o do servidor do site, por isso uma `ip_whitelist` na chave recusa ou deixa passar pelos
motivos errados. Quem precisar de whitelist chama o URL directo
`https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1` (servidor
"directo" no OpenAPI). O mesmo vale para o limite anónimo por IP: atrás do Worker, todos os
sites partilham o mesmo IP. Por isso esse limite só conta pedidos sem chave válida.

## Publicar pelo Wrangler (alternativa)

```bash
cd cloudflare/api-wegest
npx wrangler deploy   # usa wrangler.toml (Custom Domain api.wegest.pt)
```
