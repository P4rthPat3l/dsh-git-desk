import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connection, EndpointHandler, EndpointResult, Peer, WebServer } from './types.js';

const MAX_BODY = 2 * 1024 * 1024;
const PREFIX = '/git-rpc';

/** The host surface the route needs. */
export interface RouteContext {
  readonly webServer: WebServer;
  readonly connection: Connection;
}

/** One error field in a response envelope. */
interface EnvelopeError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** A response envelope, either a value or an error. */
interface ResponseEnvelope {
  type: 'server-response';
  rpcId: string;
  result: { ok: true; value: unknown } | { ok: false; error: EnvelopeError };
}

/** The request envelope a client sends. */
interface RequestEnvelope {
  type: 'client-request';
  rpcId: string;
  method: string;
  payload?: unknown;
}

/**
 * Write one JSON response.
 * @param res the response.
 * @param status the HTTP status.
 * @param payload the JSON body.
 */
function respond(res: ServerResponse, status: number, payload: ResponseEnvelope): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body, 'utf8'),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * Build one failure envelope.
 * @param rpcId the request id.
 * @param code the stable error code.
 * @param message the message.
 * @returns the envelope.
 */
function failure(rpcId: string, code: string, message: string): ResponseEnvelope {
  return {
    type: 'server-response',
    rpcId,
    result: {
      ok: false,
      error: { code, message, details: {} },
    },
  };
}

/**
 * Read a request body under the size cap.
 * @param req the request.
 * @returns the body text.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) reject(new Error('body-too-large'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/**
 * Recognise the request envelope a client sends.
 * @param value the parsed body.
 * @returns whether it is a request envelope.
 */
function isRequestEnvelope(value: unknown): value is RequestEnvelope {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === 'client-request' && typeof candidate.rpcId === 'string' && typeof candidate.method === 'string'
  );
}

/**
 * The generic RPC channel helper in this build reaches `webServer` from the
 * connection context, which does not inject it. This route speaks the same
 * envelope the browser caller expects and applies the connection admission
 * check itself.
 *
 * @param ctx the host context.
 * @param handler the endpoint handler.
 * @returns the route disposer.
 */
export function registerGitRoute(ctx: RouteContext, handler: EndpointHandler): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      let admission;
      try {
        admission = ctx.connection.admit(req);
      } catch (error) {
        respond(res, 500, failure('unknown', 'git/internal', String(error)));
        return;
      }
      if ('rejection' in admission) {
        res.writeHead(admission.rejection);
        res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end('method not allowed');
        return;
      }
      let endpoint: string;
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith(`${PREFIX}/`)) {
          respond(res, 404, failure('unknown', 'git/not-found', 'Unknown Git endpoint.'));
          return;
        }
        endpoint = decodeURIComponent(url.pathname.slice(PREFIX.length + 1));
      } catch {
        respond(res, 400, failure('unknown', 'git/bad-request', 'The Git endpoint is invalid.'));
        return;
      }
      let text: string;
      try {
        text = await readBody(req);
      } catch {
        respond(res, 413, failure('unknown', 'git/body-too-large', 'The Git request is too large.'));
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        respond(res, 400, failure('unknown', 'git/bad-request', 'The Git request is not valid JSON.'));
        return;
      }
      if (!isRequestEnvelope(parsed)) {
        respond(res, 400, failure('unknown', 'git/bad-request', 'The Git request envelope is invalid.'));
        return;
      }
      const message = parsed;
      if (message.method !== endpoint) {
        respond(
          res,
          400,
          failure(message.rpcId, 'git/bad-request', 'The Git endpoint does not match the request method.'),
        );
        return;
      }
      const peer: Peer = admission.peer;
      if (peer.principal?.kind !== 'owner') {
        respond(res, 200, failure(message.rpcId, 'git/forbidden', 'Git actions are available only to the local user.'));
        return;
      }
      let result: EndpointResult;
      try {
        result = await handler(endpoint, message.payload, undefined, peer);
      } catch (error) {
        result = {
          ok: false,
          error: {
            code: 'git/internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        };
      }
      respond(res, 200, { type: 'server-response', rpcId: message.rpcId, result });
    },
  });
}
