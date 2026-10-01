import { z } from 'npm:zod@3.25.76';
import { readBoundedJson, RequestBodyError } from '../http/boundedJson.ts';

export async function readBoundedObject(
  req: Request,
  maxBytes: number
): Promise<Record<string, unknown>> {
  const result = z.record(z.unknown()).safeParse(await readBoundedJson(req, maxBytes));
  if (!result.success) throw new RequestBodyError('Objeto JSON obrigatorio');
  return result.data;
}
