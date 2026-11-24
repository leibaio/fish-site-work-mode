export interface Conversation {
  id: string;
  title: string;
  subtitle?: string;
  avatar?: string;
  /** 无头像时使用的文字，例如作者名或会话名 */
  avatarFallback?: string;
  updatedAt?: number;
  unread?: boolean;
}

export interface ContentView {
  title: string;
  subtitle?: string;
  html: string;
  hasMore?: boolean;
  cursor?: unknown;
}

export interface ConversationPage {
  conversations: Conversation[];
  hasMore: boolean;
  cursor?: unknown;
}

export interface LoadMoreResult {
  html: string;
  hasMore: boolean;
  cursor?: unknown;
}

export interface SiteContext {
  url: string;
  canonicalId: string;
  title?: string;
}

export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";
export type LogState = "connecting" | "live" | "sim" | "unauth" | "offline";

export interface LogEntry {
  ts?: number;
  level: LogLevel;
  service: string;
  message: string;
}

export interface LogSink {
  line(entry: LogEntry): void;
  status(state: LogState): void;
}

export interface LogProvider {
  id: string;
  label: string;
  start(sink: LogSink): () => void;
}

export interface WorkNode {
  name: string;
  type: "dir" | "file";
  status?: "M" | "U" | "D" | string;
  children?: WorkNode[];
}

export interface CoverStory {
  workspace: string;
  branch: string;
  branches: string[];
  footer: string;
  fakeDocName: string;
  tabTitle: string;
  tree: WorkNode[];
}

export interface SiteAdapter {
  id: string;
  label: string;
  /** 非工作模式下左栏标题，例如「微信」 */
  normalTitle: string;
  match(url: URL): boolean;
  detect(): Promise<SiteContext | null>;
  listConversations(): Promise<Conversation[] | ConversationPage>;
  loadMoreConversations?(cursor: unknown): Promise<ConversationPage>;
  openConversation(id: string): Promise<ContentView>;
  loadMore?(id: string, cursor: unknown): Promise<LoadMoreResult>;
  initialConversationId?(ctx: SiteContext): string | null;
  /** 是否在列表加载后自动打开第一条会话，默认 true */
  autoOpenFirst?: boolean;
  conversationIdFromUrl?(url: URL): string | null;
  createLogProvider?(): LogProvider | null;
}

export interface AppOptions {
  storagePrefix?: string;
  minWidth?: number;
}