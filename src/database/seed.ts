import { DataSource } from 'typeorm';
import { Recipient } from '../recipients/recipient.entity.js';
import { Transfer } from '../transfers/transfer.entity.js';
import { PasswordService } from '../users/password.service.js';
import { User } from '../users/user.entity.js';
import { DEMO_RECIPIENTS, DEMO_TRANSFERS, DEMO_USER } from './seed-data.js';

export interface SeedResult {
  user: 'created' | 'existing';
  passwordReset: boolean;
  recipientsCreated: number;
  transfersCreated: number;
}

/**
 * Creates the demo user, recipients and transfers. Safe to run any number of
 * times: every record is found by a stable key first and only created when
 * missing, so a second run changes nothing. It never deletes anything.
 *
 * This function does not check which database it is talking to; the seed
 * command (`seed-cli.ts`) runs the destructive-script guard before calling it.
 */
export async function seedDatabase(
  dataSource: DataSource,
): Promise<SeedResult> {
  const passwords = new PasswordService();

  return dataSource.transaction(async (manager) => {
    const result: SeedResult = {
      user: 'existing',
      passwordReset: false,
      recipientsCreated: 0,
      transfersCreated: 0,
    };

    // --- user (keyed by email)
    let user = await manager.findOneBy(User, { email: DEMO_USER.email });
    if (!user) {
      user = await manager.save(
        manager.create(User, {
          email: DEMO_USER.email,
          passwordHash: await passwords.hash(DEMO_USER.password),
        }),
      );
      result.user = 'created';
    } else if (
      !(await passwords.verify(user.passwordHash, DEMO_USER.password))
    ) {
      // Keep the documented demo credentials working if someone changed them.
      user.passwordHash = await passwords.hash(DEMO_USER.password);
      await manager.save(user);
      result.passwordReset = true;
    }

    // --- recipients (keyed by owner + name)
    const recipientIds = new Map<string, string>();
    for (const demo of DEMO_RECIPIENTS) {
      let recipient = await manager.findOneBy(Recipient, {
        userId: user.id,
        name: demo.name,
      });
      if (!recipient) {
        recipient = await manager.save(
          manager.create(Recipient, { userId: user.id, ...demo }),
        );
        result.recipientsCreated++;
      }
      recipientIds.set(demo.name, recipient.id);
    }

    // --- transfers (keyed by owner + recipient + date + provider + amount + currency)
    for (const demo of DEMO_TRANSFERS) {
      const recipientId = recipientIds.get(demo.recipient)!;
      const key = {
        userId: user.id,
        recipientId,
        transferDate: demo.transferDate,
        provider: demo.provider,
        sentAmountMinor: demo.sent.minor,
        sentCurrency: demo.sent.currency,
      };
      if (await manager.existsBy(Transfer, key)) continue;

      await manager.save(
        manager.create(Transfer, {
          ...key,
          receivingCurrency: demo.receivingCurrency,
          exchangeRate: demo.exchangeRate,
          feeMinor: demo.fee.minor,
          purpose: demo.purpose,
          status: demo.status,
          notes: 'Sample data',
        }),
      );
      result.transfersCreated++;
    }
    return result;
  });
}
