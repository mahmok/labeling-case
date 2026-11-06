import { asError, err, type Result } from "../utils/result.ts";

export type TransactionRunner<TTransaction> = <T>(operation: (transaction: TTransaction) => Promise<T>) => Promise<T>;

export interface UnitOfWork<TTransaction> {
  execute<T>(operation: (transaction: TTransaction) => Promise<Result<T, Error>>): Promise<Result<T, Error>>;
}

const rollback = Symbol("unit-of-work-rollback");

export const createUnitOfWork = <TTransaction>(
  runTransaction: TransactionRunner<TTransaction>,
): UnitOfWork<TTransaction> => ({
  async execute<T>(operation: (transaction: TTransaction) => Promise<Result<T, Error>>): Promise<Result<T, Error>> {
    let result: Result<T, Error> | undefined;

    try {
      await runTransaction(async (transaction) => {
        result = await operation(transaction);
        if (!result.isOk) throw rollback;
        return result;
      });

      return result ?? err(new Error("Transaction completed without an operation result"));
    } catch (error) {
      if (result && !result.isOk) return result;
      return err(asError(error));
    }
  },
});
