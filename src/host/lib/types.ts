import type { IncomingMessage, ServerResponse } from 'node:http';

/** The harness services the Git host plugin receives. */

/** One workspace the registry knows. */
export interface WorkspaceRecord {
  readonly path: string;
  readonly id?: string;
  readonly title?: string;
}

/** The workspace registry service. */
export interface WorkspaceRegistry {
  get(id: string): WorkspaceRecord | undefined;
}

/** The caller behind an admitted request. */
export interface Peer {
  readonly principal?: { readonly kind?: string };
}

/** A request the connection service admitted. */
export interface Admitted {
  readonly peer: Peer;
}

/** A request the connection service rejected. */
export interface Rejected {
  readonly rejection: number;
}

export type Admission = Admitted | Rejected;

/** One authenticated browser connection. */
export interface Connection {
  admit(request: IncomingMessage): Admission;
}

/** One route the web server exposes. */
export interface Route {
  readonly kind: 'prefix';
  readonly path: string;
  readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
}

/** The web server service. */
export interface WebServer {
  register(route: Route): () => void;
}

/** One collected stream chunk. */
export interface StreamChunk {
  text?: string;
  lossy?: boolean;
  spillPath?: string;
}

/** A collected output stream. */
export interface CollectedStream {
  readFrom(offset: number): StreamChunk | undefined;
}

/** The outcome of one child process. */
export interface SpawnOutcome {
  exitCode: number | null;
  signal: string | null;
}

/** A running child process. */
export interface SpawnHandle {
  done: Promise<SpawnOutcome>;
  collected: { stdout?: CollectedStream; stderr?: CollectedStream };
}

/** What one spawn call asks for. */
export interface SpawnOptions {
  argv: string[];
  cwd: string;
  stdio: {
    stdin: 'ignore' | { data: string };
    stdout: { maxBytes: number; spill?: { maxBytes: number } };
    stderr: { maxBytes: number };
  };
  graceMs: number;
  signal: AbortSignal;
  env: Record<string, string | undefined>;
}

/** The subprocess service. */
export interface SubprocessService {
  resolveExecutable(name: string): Promise<string>;
  spawn(options: SpawnOptions): SpawnHandle;
}

/** One failure as the endpoint handler reports it. */
export interface EndpointFailure {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** The value an endpoint handler resolves with. */
export type EndpointResult = { ok: true; value: unknown } | { ok: false; error: EndpointFailure };

/** The endpoint handler the route calls. */
export type EndpointHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal | undefined,
  peer: Peer | undefined,
) => Promise<EndpointResult>;

/** The host context this plugin receives. */
export interface HostContext {
  readonly subprocess: SubprocessService;
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly connection: Connection;
  readonly webServer: WebServer;
  get(name: string): unknown;
  effect(callback: () => (() => void) | void, label?: string): void;
}
