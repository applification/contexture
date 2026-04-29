// Bounded-parallelism gate. Returns a function that wraps any async task and
// holds it until a slot is free. Slots are released when the wrapped task
// settles (resolved or rejected), so a thrown task does not leak a slot.
//
// Reimplemented in-tree to avoid pulling p-limit as a direct dependency for a
// single use site.
export function createLimit(maxParallel: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const queue: (() => void)[] = [];

  const acquire = () =>
    running < maxParallel
      ? (running++, Promise.resolve())
      : new Promise<void>((resolve) => queue.push(resolve));

  const release = () => {
    running--;
    const next = queue.shift();
    if (next) {
      running++;
      next();
    }
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}
