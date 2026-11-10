const MAX_BODY = 2 * 1024 * 1024;
const PREFIX = '/git-rpc';
/**
 * Write one JSON response.
 * @param res the response.
 * @param status the HTTP status.
 * @param payload the JSON body.
 */
function respond(res, status, payload) {
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
function failure(rpcId, code, message) {
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
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                tooLarge = true;
                chunks.length = 0;
                return;
            }
            if (!tooLarge)
                chunks.push(chunk);
        });
        req.on('end', () => {
            if (tooLarge)
                reject(new Error('body-too-large'));
            else
                resolve(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', reject);
    });
}
/**
 * Recognise the request envelope a client sends.
 * @param value the parsed body.
 * @returns whether it is a request envelope.
 */
function isRequestEnvelope(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const candidate = value;
    return (candidate.type === 'client-request' && typeof candidate.rpcId === 'string' && typeof candidate.method === 'string');
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
export function registerGitRoute(ctx, handler) {
    return ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: async (req, res) => {
            let admission;
            try {
                admission = ctx.connection.admit(req);
            }
            catch (error) {
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
            let endpoint;
            try {
                const url = new URL(req.url ?? '/', 'http://localhost');
                if (!url.pathname.startsWith(`${PREFIX}/`)) {
                    respond(res, 404, failure('unknown', 'git/not-found', 'Unknown Git endpoint.'));
                    return;
                }
                endpoint = decodeURIComponent(url.pathname.slice(PREFIX.length + 1));
            }
            catch {
                respond(res, 400, failure('unknown', 'git/bad-request', 'The Git endpoint is invalid.'));
                return;
            }
            let text;
            try {
                text = await readBody(req);
            }
            catch {
                respond(res, 413, failure('unknown', 'git/body-too-large', 'The Git request is too large.'));
                return;
            }
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                respond(res, 400, failure('unknown', 'git/bad-request', 'The Git request is not valid JSON.'));
                return;
            }
            if (!isRequestEnvelope(parsed)) {
                respond(res, 400, failure('unknown', 'git/bad-request', 'The Git request envelope is invalid.'));
                return;
            }
            const message = parsed;
            if (message.method !== endpoint) {
                respond(res, 400, failure(message.rpcId, 'git/bad-request', 'The Git endpoint does not match the request method.'));
                return;
            }
            const peer = admission.peer;
            if (peer.principal?.kind !== 'owner') {
                respond(res, 200, failure(message.rpcId, 'git/forbidden', 'Git actions are available only to the local user.'));
                return;
            }
            let result;
            try {
                result = await handler(endpoint, message.payload, undefined, peer);
            }
            catch (error) {
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
