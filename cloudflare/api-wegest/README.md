# api.wegest.pt (Cloudflare Worker)

A API externa de rent-a-car passa a viver em `https://api.wegest.pt/v1`. Este Worker recebe
`https://api.wegest.pt/v1/*` e faz fetch a
`https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1/*`, com o mesmo
método, query, corpo e cabeçalhos. Devolve a resposta tal qual e não guarda nada em cache.

**Porquê:** pelo rewrite da Vercel (`wegest.pt/api/rent-a-car`), a firewall da Vercel desafia
rajadas de pedidos. Num teste de 70 pedidos em 20 s vieram 19 respostas 200 e 51 respostas 403
"Vercel Security Checkpoint". Pela URL directa do Supabase vieram 70 respostas 200. O DNS de
wegest.pt já está no Cloudflare, por isso o Worker fica à frente sem passar pela Vercel.

| Pedido                 | Resposta                                             |
| ---------------------- | ---------------------------------------------------- |
| `GET /`                | `{ nome, versao, documentacao }` (do próprio Worker) |
| `/v1` e `/v1/*`        | o que a edge function responder                      |
| qualquer outro caminho | `404 { "erro": { "codigo": "NAO_ENCONTRADO", … } }`  |
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
4. **Desligar o desafio a bots só em api.wegest.pt.** Os pedidos vêm do backend do site, não
   de um browser, e um desafio parte a integração.
   - Rules → Configuration Rules → Create rule → _Hostname equals `api.wegest.pt`_ →
     **Security Level: Essentially Off** e **Browser Integrity Check: Off** → Deploy.
   - Em plano Pro ou superior (Super Bot Fight Mode): Security → WAF → Custom rules → _Hostname
     equals `api.wegest.pt`_ → acção **Skip** → marcar Super Bot Fight Mode (e as regras
     geridas que estejam a desafiar).
   - Em plano Free, o **Bot Fight Mode** é da zona inteira e não se salta por regra. Se estiver
     ligado (Security → Bots) e o teste do passo 5 der desafios, tem de ser desligado para a
     zona `wegest.pt`.
5. **Testar.**

   ```bash
   curl -s https://api.wegest.pt/
   curl -s https://api.wegest.pt/v1
   curl -s https://api.wegest.pt/v1/health -H "X-API-Key: wg_ra_..."
   # Rajada: 70 pedidos em ~20 s têm de dar todos 200 (sem 403 de desafio)
   for i in $(seq 70); do curl -s -o /dev/null -w "%{http_code}\n" \
     https://api.wegest.pt/v1/health -H "X-API-Key: wg_ra_..."; done | sort | uniq -c
   ```

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
