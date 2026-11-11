import type { ComponentType, ReactNode } from 'react';

/** Harness services the Git client receives through its plugin context. */

/** One outcome of a route call. */
export type RpcOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } };

/** The RPC client behind the connection service. */
export interface RpcClient {
  call(route: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcOutcome>;
}

/** The connection service. */
export interface ConnectionService {
  rpc: RpcClient;
}

/** The translator bound to the `git` namespace. */
export type Translator = (key: string, values?: Record<string, string | number>) => string;

/** The locale service. */
export interface LocaleService {
  register(namespace: string, language: string, dictionary: Record<string, string>): void;
  bind(namespace: string): Translator;
}

/** One tab the sidebar already holds. */
export interface SidebarTab {
  id: string;
  kind: string;
}

/** The right sidebar service, as far as this client uses it. */
export interface SidebarRightService {
  active(): SidebarTab | undefined;
  isExpanded(): boolean;
  hide(id: string): void;
  openTab(kind: string, options?: { params?: Record<string, unknown> }): void;
  tabsIn(sessionId: string): SidebarTab[];
  openResource(address: string, options?: { kind?: string; params?: Record<string, unknown> }): void;
}

/** One guide card on the start screen. */
export interface GuideEntry {
  id: string;
  order: number;
  title: () => string;
  description: () => string;
  icon: () => ReactNode;
}

/** One tab type registration. */
export interface TabTypeDefinition {
  id: string;
  kind: string;
  priority: 'extension' | 'builtin' | 'fallback';
  title: (address: string) => string;
  guide?: GuideEntry[];
}

/** The tab registry. */
export interface SidebarRightTabsService {
  register(definition: TabTypeDefinition): () => void;
}

/** One slot registration. */
export interface SlotSpec {
  name: string;
  key?: string;
  id?: string;
  order?: number;
  locale?: string;
  label?: () => string;
  inject?: (sessionId: string) => Record<string, unknown>;
}

/** The slot service. */
export interface SlotsService {
  inject(name: string, register: () => (() => void) | void): void;
  register<P>(spec: SlotSpec, component: ComponentType<P>): () => void;
}

/** One keyboard command. */
export interface ShortcutCommand {
  id: string;
  label: () => string;
  aliases: string[];
  defaults: Record<string, string>;
  regions: string[];
  modals: string[];
  resolve: () => { status: 'handled'; run: () => void } | { status: 'blocked'; reason: string };
}

/** The scope a command registers in. */
export interface ShortcutScope {
  shortcuts: { register(command: ShortcutCommand): () => void };
  effect(callback: () => (() => void) | void, label?: string): void;
}

/** The plugin context the harness passes to `apply`. */
export interface ClientContext {
  connection: ConnectionService;
  locale: LocaleService;
  slots: SlotsService;
  sidebarRight: SidebarRightService;
  sidebarRightTabs: SidebarRightTabsService;
  inject(names: string[], callback: (scope: ShortcutScope) => void): void;
  effect(callback: () => (() => void) | void, label?: string): void;
}

/** Navigation parameters the sidebar passes to a tab. */
export interface TabNavigation {
  address?: string;
  params?: Record<string, unknown>;
  revision?: number;
}

/** The tab and pane the harness hands to one slot body. */
export interface TabInfo {
  tab: { id: string; contentId?: string; visible?: boolean; navigation?: TabNavigation };
  panel: { id: string };
}

/** The tab hook the harness injects. */
export type UseTabInfo = () => TabInfo;

/** One registered workspace. */
export interface WorkspaceItem {
  workspaceId: string;
  path: string;
  title?: string;
  sessionIds?: string[];
}

/** One session. */
export interface SessionItem {
  cwd?: string;
  /** Projections the harness publishes per session; `workingDirectory` follows the Session. */
  projectionValues?: {
    workingDirectory?: string | null;
  };
}

export interface WorkspaceState {
  items: WorkspaceItem[];
}

export interface SessionState {
  byId: Record<string, SessionItem | undefined>;
}

/** A store hook shaped like the harness session and workspace hooks. */
export type StoreHook<T> = <R>(selector: (state: T) => R) => R;
