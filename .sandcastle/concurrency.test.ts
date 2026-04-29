import { describe, expect, test } from "bun:test";
import { createLimit } from "./concurrency";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("createLimit", () => {
  test("never runs more than maxParallel tasks at once", async () => {
    const limit = createLimit(2);
    let inflight = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());

    const results = gates.map((g, i) =>
      limit(async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await g.promise;
        inflight--;
        return i;
      }),
    );

    // Let the first wave start.
    await flush();
    expect(inflight).toBe(2);

    // Release one — a queued task should take its slot.
    gates[0]!.resolve();
    await flush();
    expect(inflight).toBe(2);

    // Release the rest in order.
    for (let i = 1; i < gates.length; i++) gates[i]!.resolve();

    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  test("a thrown task releases its slot", async () => {
    const limit = createLimit(1);
    let ran = 0;

    const a = limit(async () => {
      ran++;
      throw new Error("boom");
    });
    const b = limit(async () => {
      ran++;
      return "ok";
    });

    await expect(a).rejects.toThrow("boom");
    expect(await b).toBe("ok");
    expect(ran).toBe(2);
  });

  test("with maxParallel=1, tasks run strictly sequentially", async () => {
    const limit = createLimit(1);
    const order: number[] = [];

    const tasks = [1, 2, 3].map((n) =>
      limit(async () => {
        order.push(n);
        await new Promise((r) => setTimeout(r, 0));
        return n;
      }),
    );

    expect(await Promise.all(tasks)).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });
});
