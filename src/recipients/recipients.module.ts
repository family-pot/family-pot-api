import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Recipient } from './recipient.entity.js';
import { RecipientUsageRegistry } from './recipient-usage.registry.js';
import { RecipientsController } from './recipients.controller.js';
import { RecipientsService } from './recipients.service.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Recipient])],
  controllers: [RecipientsController],
  providers: [RecipientsService, RecipientUsageRegistry],
  // Other modules register "recipient in use" checks with the registry, and
  // look recipients up through the service (always scoped to the owner).
  exports: [RecipientsService, RecipientUsageRegistry],
})
export class RecipientsModule {}
