export interface UsageRecord {
  key: string;      // sessionId:requestId (dedupe entre .json y .jsonl)
  ts: number;       // ms epoch
  model: string;
  mode: string;     // agent | ask | plan | edit | ?
  input: number;    // tokens de entrada NO cacheados
  cached: number;
  output: number;
  credits: number;
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);

function modeOf(session: any, req: any): string {
  const m = req?.modeInfo?.modeId ?? req?.mode?.id ?? req?.agent?.id ?? session?.inputState?.mode?.id ?? session?.inputState?.mode;
  const s = typeof m === 'string' ? m : '?';
  return s.replace(/^.*[/:]/, '').toLowerCase() || '?';
}

function modelOf(session: any, req: any): string {
  const m = req?.modelId ?? req?.result?.metadata?.modelId ?? req?.result?.details ?? session?.inputState?.selectedModel?.identifier;
  return typeof m === 'string' ? m.replace(/^copilot\//, '') : 'unknown';
}

/**
 * VS Code >= 1.14x (agent host): agentSessionData/<id>/session.db, tabla turn_usage.
 * `_meta.turnTokenTotals` suma todas las rondas del turno (el nivel superior solo trae la última llamada);
 * su inputTokens incluye los cacheados. No hay hora ni modo por fila: ts=0 y la fecha la asigna el store.
 */
export function extractTurnUsage(sessionId: string, rows: { turnId: string; usage: any }[], mode = 'desconocido'): UsageRecord[] {
  const out: UsageRecord[] = [];
  for (const { turnId, usage: u } of rows) {
    const key = `${sessionId}:${turnId}`;
    const nano = num(u?._meta?.copilotUsage?.totalNanoAiu);
    const totals: any[] = Array.isArray(u?._meta?.turnTokenTotals) && u._meta.turnTokenTotals.length
      ? u._meta.turnTokenTotals
      : [{ model: u?.model, inputTokens: u?.inputTokens, cachedTokens: u?.cacheReadTokens, outputTokens: u?.outputTokens }];
    totals.forEach((t, i) => {
      const inp = num(t?.inputTokens), cached = Math.min(num(t?.cachedTokens), inp), output = num(t?.outputTokens);
      if (!inp && !output) { return; }
      out.push({ key: `${key}:${t?.model ?? i}`, ts: 0, model: String(t?.model ?? 'unknown'), mode,
        input: inp - cached, cached, output, credits: i === 0 ? nano / 1e9 : 0 });
    });
  }
  return out;
}

export function extractSession(session: any, fallbackId: string, fileMtime: number): UsageRecord[] {
  const out: UsageRecord[] = [];
  const sid = session?.sessionId ?? fallbackId;
  const reqs: any[] = Array.isArray(session?.requests) ? session.requests : [];
  reqs.forEach((req, idx) => {
    const key = `${sid}:${req?.requestId ?? idx}`;
    const ts = num(req?.timestamp) || num(session?.creationDate) || fileMtime;
    const mode = modeOf(session, req);
    const credits = num(req?.copilotCredits) || num(req?.result?.metadata?.copilotCredits);
    const totals = req?.modelTotals;
    if (totals && typeof totals === 'object' && Object.keys(totals).length) {
      // Suma todas las rondas del agente; una fila por modelo.
      for (const [model, t] of Object.entries<any>(totals)) {
        const inp = num(t?.inputTokens), cached = Math.min(num(t?.cachedTokens), inp);
        out.push({ key: `${key}:${model}`, ts, model: model.replace(/^copilot\//, ''), mode,
          input: inp - cached, cached, output: num(t?.outputTokens),
          credits: Object.keys(totals).length === 1 ? credits : 0 });
      }
      return;
    }
    const output = num(req?.completionTokens) || num(req?.result?.metadata?.outputTokens) || num(req?.result?.metadata?.completionTokens);
    const input = num(req?.result?.metadata?.promptTokens) || num(req?.promptTokens);
    if (!input && !output && !credits) { return; } // request aún sin respuesta
    out.push({ key, ts, model: modelOf(session, req), mode, input, cached: 0, output, credits });
  });
  return out;
}
