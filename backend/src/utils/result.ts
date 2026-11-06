type Success<T> = { isOk: true; value: T };
type Failure<E> = { error: E; isOk: false };

export type Result<T, E> = Failure<E> | Success<T>;

export function ok<E = never>(): Result<void, E>;
export function ok<T, E = never>(value: T): Result<T, E>;
export function ok<T = void, E = never>(value?: T): Result<T, E> {
  return { isOk: true, value: value as T };
}

export const err = <T, E>(error: E): Result<T, E> => ({ error, isOk: false });

export const isOk = <T, E>(result: Result<T, E>): result is Success<T> => result.isOk;

export const isErr = <T, E>(result: Result<T, E>): result is Failure<E> => !result.isOk;

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export type RetryUntilSuccessOptions = {
  timeoutMs: number;
  retryDelayMs: number;
};

const DEFAULT_RETRY_OPTIONS: RetryUntilSuccessOptions = {
  retryDelayMs: 1000,
  timeoutMs: 5000,
};

export const retryUntilSuccess = async <T, E>(
  operation: () => Promise<Result<T, E>>,
  options: RetryUntilSuccessOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Result<T, E>> => {
  const deadline = performance.now() + options.timeoutMs;

  let lastResult = await operation();

  while (!lastResult.isOk) {
    const remaining = deadline - performance.now();

    if (remaining <= 0) {
      break;
    }

    await sleep(Math.min(options.retryDelayMs, remaining));

    lastResult = await operation();
  }

  return lastResult;
};

export const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
