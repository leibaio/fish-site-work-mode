import type { LogEntry, LogProvider, LogSink } from "./types";

const TEMPLATES: Array<() => LogEntry> = [
  () => ({ level: "INFO", service: "api-gateway", message: `POST /api/v2/orders 200 ${rand(8, 120)}ms trace=${hex(12)}` }),
  () => ({ level: "INFO", service: "api-gateway", message: `GET /api/v2/topics?page=${rand(1, 20)} 200 ${rand(10, 60)}ms` }),
  () => ({ level: "DEBUG", service: "auth-service", message: `token refresh uid=${rand(1000, 9999)} exp=3600s` }),
  () => ({ level: "INFO", service: "content-service", message: `topic ${rand(10000, 99999)} cached ttl=300s` }),
  () => ({ level: "DEBUG", service: "redis", message: `GET feed:${rand(1000, 9999)} hit=1 ttl=${rand(60, 600)}` }),
  () => ({ level: "INFO", service: "search-service", message: `query "${pickWord()}" hits=${rand(2, 200)} took=${rand(5, 80)}ms` }),
  () => ({ level: "INFO", service: "ci-runner", message: `[build ${rand(4700, 4999)}] npm test — ${rand(180, 400)} passed` }),
  () => ({ level: "INFO", service: "deploy", message: `staging ${hex(7)} rolled out ${rand(1, 4)}/4` }),
  () => ({ level: "WARN", service: "inventory", message: `stock below threshold sku=SKU-${rand(1000, 9999)}` }),
  () => ({ level: "INFO", service: "payment", message: `settlement batch=${rand(100, 999)} amount=¥${rand(10, 999)}.${rand(10, 99)}` }),
  () => ({ level: "DEBUG", service: "mysql", message: `SELECT id,status FROM orders WHERE id=? (${rand(2, 40)}ms)` }),
  () => ({ level: "ERROR", service: "payment", message: `upstream bank timeout retry=${rand(1, 3)}/3` }),
];

const WORDS = ["orders", "refund", "inventory", "session", "report", "invoice", "coupon", "shipment"];

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function hex(length: number): string {
  const chars = "0123456789abcdef";
  let output = "";
  for (let i = 0; i < length; i++) output += chars[Math.floor(Math.random() * 16)];
  return output;
}

function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

export class SimulatedLogProvider implements LogProvider {
  id = "simulated";
  label = "模拟日志";

  start(sink: LogSink): () => void {
    let stopped = false;
    sink.status("sim");

    const append = (count: number) => {
      if (stopped) return;
      for (let i = 0; i < count; i++) {
        const entry = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]();
        sink.line({ ...entry, ts: Date.now() - rand(0, 8000) });
      }
    };

    append(140);
    const timer = window.setInterval(() => append(1), 2200);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }
}