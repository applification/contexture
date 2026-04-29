import { describe, expect, test } from "bun:test";
import { isSandboxStartupRetryable, retryWithBackoff } from "./retry";

// Real sandcastle errors are Effect tagged errors carrying a string `_tag`.
// We mimic that minimal shape here so the predicate and helper can be tested
// without standing up a real sandbox.
const tagged = (tag: string, message = "boom") =>
  Object.assign(new Error(message), { _tag: tag });

const noSleep = async () => {};

describe("isSandboxStartupRetryable", () => {
  test.each([
    "DockerError",
    "PodmanError",
    "ContainerStartTimeoutError",
    "WorktreeError",
    "WorktreeTimeoutError",
    "CopyError",
    "CopyToWorktreeTimeoutError",
    "SyncError",
    "SyncInTimeoutError",
    "GitSetupTimeoutError",
    "HookTimeoutError",
  ])("%s is retryable", (tag) => {
    expect(isSandboxStartupRetryable(tagged(tag))).toBe(true);
  });

  test.each([
    "AgentError",
    "ConfigDirError",
    "InitError",
    "CwdError",
    "ExecHostError",
    "PromptError",
  ])("%s is not retryable", (tag) => {
    expect(isSandboxStartupRetryable(tagged(tag))).toBe(false);
  });

  test("plain Error is not retryable", () => {
    expect(isSandboxStartupRetryable(new Error("plain"))).toBe(false);
  });

  test("non-object thrown values are not retryable", () => {
    expect(isSandboxStartupRetryable("string error")).toBe(false);
    expect(isSandboxStartupRetryable(undefined)).toBe(false);
    expect(isSandboxStartupRetryable(null)).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  test("returns the value on first-attempt success", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        return "ok";
      },
      { maxAttempts: 2, baseMs: 1, jitter: false, isRetryable: () => true, sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries on a retryable error and succeeds on attempt 2", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls === 1) throw tagged("DockerError");
        return "ok";
      },
      {
        maxAttempts: 2,
        baseMs: 1,
        jitter: false,
        isRetryable: isSandboxStartupRetryable,
        sleep: noSleep,
      },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  test("exhausts attempts and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw tagged("DockerError", `attempt ${calls}`);
        },
        {
          maxAttempts: 2,
          baseMs: 1,
          jitter: false,
          isRetryable: isSandboxStartupRetryable,
          sleep: noSleep,
        },
      ),
    ).rejects.toMatchObject({ _tag: "DockerError", message: "attempt 2" });
    expect(calls).toBe(2);
  });

  test("does not retry a non-retryable error", async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw tagged("CwdError", "bad cwd");
        },
        {
          maxAttempts: 5,
          baseMs: 1,
          jitter: false,
          isRetryable: isSandboxStartupRetryable,
          sleep: noSleep,
        },
      ),
    ).rejects.toMatchObject({ _tag: "CwdError" });
    expect(calls).toBe(1);
  });

  test("invokes onRetry between failed attempts with attempt number and delay", async () => {
    const events: { attempt: number; nextDelayMs: number }[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 3) throw tagged("DockerError");
        return "ok";
      },
      {
        maxAttempts: 3,
        baseMs: 100,
        jitter: false,
        isRetryable: isSandboxStartupRetryable,
        sleep: noSleep,
        onRetry: ({ attempt, nextDelayMs }) => events.push({ attempt, nextDelayMs }),
      },
    );
    expect(events).toEqual([
      { attempt: 1, nextDelayMs: 100 },
      { attempt: 2, nextDelayMs: 100 },
    ]);
    expect(calls).toBe(3);
  });

  test("with jitter, delay falls in [0.5*base, 1.5*base]", async () => {
    const observed: number[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 4) throw tagged("DockerError");
        return "ok";
      },
      {
        maxAttempts: 4,
        baseMs: 1000,
        jitter: true,
        isRetryable: isSandboxStartupRetryable,
        sleep: noSleep,
        onRetry: ({ nextDelayMs }) => observed.push(nextDelayMs),
      },
    );
    for (const ms of observed) {
      expect(ms).toBeGreaterThanOrEqual(500);
      expect(ms).toBeLessThanOrEqual(1500);
    }
  });

  test("uses the injected sleep between retries", async () => {
    const sleeps: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleeps.push(ms);
    };
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw tagged("DockerError");
        return "ok";
      },
      {
        maxAttempts: 2,
        baseMs: 2000,
        jitter: false,
        isRetryable: isSandboxStartupRetryable,
        sleep: fakeSleep,
      },
    );
    expect(sleeps).toEqual([2000]);
  });
});
