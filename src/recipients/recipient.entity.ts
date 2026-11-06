import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity.js';
import { User } from '../users/user.entity.js';

@Entity({ name: 'recipients' })
export class Recipient extends AppBaseEntity {
  /** Owner. Every query is scoped to it (ADR 0005). */
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** ISO 3166-1 alpha-2, uppercase. */
  @Column({ type: 'varchar', length: 2 })
  country: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;
}
