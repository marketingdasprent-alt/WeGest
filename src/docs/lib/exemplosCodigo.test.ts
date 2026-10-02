import { describe, expect, it } from 'vitest';
import { LINGUAGENS, exemploDePedido, urlExemplo } from './exemplosCodigo';
import { SERVIDOR, operacao, operacoes, type Operacao } from './spec';

const S = 'https://api.wegest.pt/v1';

describe('URL de exemplo', () => {
  it('troca o {id} pelo exemplo e junta a query', () => {
    expect(SERVIDOR).toBe(S);
    expect(urlExemplo(operacao('GET /modelos/{id}'), S)).toBe(
      `${S}/modelos/b4e8f1a2-5c6d-4e7f-8a9b-0c1d2e3f4a5b`
    );
    expect(urlExemplo(operacao('GET /modelos'), S)).toBe(
      `${S}/modelos?categoria=7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d&tipo=passageiros`
    );
    expect(urlExemplo(operacao('GET /'), S)).toBe(S);
  });
});

describe('exemplos de pedido', () => {
  const health = operacao('GET /health');

  it('cURL leva a chave por variável de ambiente', () => {
    expect(exemploDePedido(health, 'curl', S)).toBe(
      `curl "${S}/health" \\\n  -H "X-API-Key: $WEGEST_API_KEY"`
    );
  });

  it('JavaScript é Node.js de servidor com process.env', () => {
    const js = exemploDePedido(health, 'javascript', S);
    expect(js).toContain("headers: { 'X-API-Key': process.env.WEGEST_API_KEY }");
    expect(js).toContain('Node.js (servidor)');
    expect(js).not.toMatch(/window|document|localStorage/);
  });

  it('PHP usa curl_init nativo e getenv', () => {
    const php = exemploDePedido(health, 'php', S);
    expect(php.startsWith('<?php')).toBe(true);
    expect(php).toContain("curl_init('https://api.wegest.pt/v1/health')");
    expect(php).toContain("getenv('WEGEST_API_KEY')");
  });

  it('operação pública não leva chave', () => {
    for (const { id } of LINGUAGENS) {
      expect(exemploDePedido(operacao('GET /'), id, S)).not.toContain('X-API-Key');
    }
  });

  it('nenhum exemplo, em nenhuma operação, traz uma chave literal', () => {
    for (const op of operacoes()) {
      for (const { id } of LINGUAGENS) {
        expect(exemploDePedido(op, id, S), `${op.id} ${id}`).not.toMatch(/wg_ra_/);
      }
    }
  });

  it('métodos com escrita põem o método explícito', () => {
    const post: Operacao = {
      ...health,
      metodo: 'POST',
      id: 'POST /reservas',
      caminho: '/reservas',
    };
    expect(exemploDePedido(post, 'curl', S)).toContain('curl -X POST');
    expect(exemploDePedido(post, 'javascript', S)).toContain("method: 'POST'");
    expect(exemploDePedido(post, 'php', S)).toContain("CURLOPT_CUSTOMREQUEST => 'POST'");
  });
});
