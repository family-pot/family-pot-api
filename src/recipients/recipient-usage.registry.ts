import { Injectable } from '@nestjs/common';

/** Answers whether other records still depend on a recipient. */
export interface RecipientUsageChecker {
  /** Number of records of the checker's kind that reference the recipient. */
  count(userId: string, recipientId: string): Promise<number>;
}

/**
 * Modules that hold records pointing at a recipient (transfers) register a
 * checker here, so deleting a recipient in use can be refused without this
 * module knowing about them.
 */
@Injectable()
export class RecipientUsageRegistry {
  private readonly checkers: {
    name: string;
    checker: RecipientUsageChecker;
  }[] = [];

  register(name: string, checker: RecipientUsageChecker): void {
    this.checkers.push({ name, checker });
  }

  /** Names of the kinds of records that still reference the recipient, with counts. */
  async usage(
    userId: string,
    recipientId: string,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const { name, checker } of this.checkers) {
      const count = await checker.count(userId, recipientId);
      if (count > 0) result[name] = count;
    }
    return result;
  }
}
