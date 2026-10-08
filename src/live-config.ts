import { StringDecoder } from 'node:string_decoder';
import { readClassifierConfig } from './classifier.ts';

export class LiveInputError extends Error {}

export function readLiveConfig(env: Record<string, string | undefined>) {
  if (env.ROUTER_MODE !== undefined && env.ROUTER_MODE !== 'observe') {
    throw new LiveInputError('ROUTER_MODE must be observe; guarded routing requires probability calibration before launch');
  }
  const flag = env.ALLOW_JEV_CLASSIFICATION;
  if (flag !== undefined && flag !== 'true' && flag !== 'false') {
    throw new LiveInputError('ALLOW_JEV_CLASSIFICATION must be true or false');
  }
  const allowClassification = flag === 'true';
  const apiKey = env.TYPESAFE_API_KEY?.trim() ?? '';
  if (allowClassification) {
    try { readClassifierConfig(env); } catch (error) { throw new LiveInputError((error as Error).message); }
  }
  return { allowClassification, apiKey };
}

export async function readLiveInput(chunks: AsyncIterable<Uint8Array | string>): Promise<string> {
  const decoder = new StringDecoder('utf8');
  let input = '';
  for await (const chunk of chunks) {
    input += typeof chunk === 'string' ? chunk : decoder.write(Buffer.from(chunk));
    if (input.length > 100_000) throw new LiveInputError('Input exceeds 100000 characters');
  }
  input += decoder.end();
  if (!input.trim()) throw new LiveInputError('Provide a nonempty prompt on stdin');
  if (input.length > 100_000) throw new LiveInputError('Input exceeds 100000 characters');
  return input;
}
