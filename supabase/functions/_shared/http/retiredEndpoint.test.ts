import { assertEquals } from 'jsr:@std/assert@1';

import { retiredEndpointResponse } from './retiredEndpoint.ts';

Deno.test('endpoint descontinuado nunca devolve campos históricos de token', async () => {
  const response = retiredEndpointResponse();

  assertEquals(response.status, 410);
  assertEquals(await response.json(), {
    success: false,
    error: 'Endpoint descontinuado.',
  });
});
