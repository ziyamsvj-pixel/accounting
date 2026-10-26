import type { Clock, OutboxEvent } from "./ports";

export interface OutboxStore {
  pending(nowIso: string, limit: number): Promise<OutboxEvent[]>;
  markDone(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string, nextAvailableAt: string | null): Promise<void>;
}

export type OutboxHandler = (e: OutboxEvent) => Promise<void>;

/**
 * Worker خواندن Outbox با Retry نمایی و Dead Letter.
 * Handlerها (ایجنت‌ها، Projection) باید idempotent باشند چون تحویل at-least-once است.
 */
export class OutboxDispatcher {
  constructor(
    private readonly store: OutboxStore,
    private readonly handler: OutboxHandler,
    private readonly clock: Clock,
    private readonly maxAttempts = 5,
    private readonly baseDelayMs = 1000,
  ) {}

  async tick(limit = 50): Promise<{ done: number; retried: number; dead: number }> {
    const now = this.clock.nowIso();
    const events = await this.store.pending(now, limit);
    let done = 0,
      retried = 0,
      dead = 0;
    for (const e of events) {
      try {
        await this.handler(e);
        await this.store.markDone(e.eventId);
        done++;
      } catch (err) {
        const attempts = e.attempts + 1;
        const msg = err instanceof Error ? err.message : String(err);
        if (attempts >= this.maxAttempts) {
          await this.store.markFailed(e.eventId, msg, null);
          dead++;
        } else {
          const delay = this.baseDelayMs * 2 ** (attempts - 1);
          await this.store.markFailed(
            e.eventId,
            msg,
            new Date(Date.parse(now) + delay).toISOString(),
          );
          retried++;
        }
      }
    }
    return { done, retried, dead };
  }
}

/** Store درحافظه روی آرایهٔ Outbox وضعیت MemoryState. */
export class InMemoryOutboxStore implements OutboxStore {
  constructor(private readonly events: () => OutboxEvent[]) {}
  async pending(nowIso: string, limit: number) {
    return this.events()
      .filter((e) => e.status === "PENDING" && e.availableAt <= nowIso)
      .slice(0, limit);
  }
  async markDone(id: string) {
    const e = this.find(id);
    e.status = "DONE";
    e.lastError = null;
  }
  async markFailed(id: string, error: string, next: string | null) {
    const e = this.find(id);
    e.attempts += 1;
    e.lastError = error;
    if (next === null) e.status = "DEAD";
    else e.availableAt = next;
  }
  private find(id: string) {
    const e = this.events().find((x) => x.eventId === id);
    if (!e) throw new Error(`event ${id} not found`);
    return e;
  }
}
