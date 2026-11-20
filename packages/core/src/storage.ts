declare function GM_getValue<T = unknown>(key: string, fallback?: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_registerMenuCommand(name: string, callback: () => void): void;

export interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export function createStore(prefix: string): Store {
  const fullKey = (key: string) => `${prefix}:${key}`;

  return {
    get<T>(key: string, fallback: T): T {
      const name = fullKey(key);
      try {
        if (typeof GM_getValue === "function") {
          const value = GM_getValue<T>(name, fallback);
          return value === undefined || value === null ? fallback : value;
        }
      } catch {
        // 忽略，退回 localStorage
      }
      try {
        const raw = localStorage.getItem(name);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },

    set(key: string, value: unknown): void {
      const name = fullKey(key);
      try {
        if (typeof GM_setValue === "function") {
          GM_setValue(name, value);
          return;
        }
      } catch {
        // 忽略，退回 localStorage
      }
      try {
        localStorage.setItem(name, JSON.stringify(value));
      } catch {
        // 存储不可用时静默失败
      }
    },
  };
}

export function registerMenu(name: string, callback: () => void): void {
  try {
    if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand(name, callback);
  } catch {
    // 忽略
  }
}