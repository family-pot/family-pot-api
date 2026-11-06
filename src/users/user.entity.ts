import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity.js';

@Entity({ name: 'users' })
export class User extends AppBaseEntity {
  /** Always stored lowercase, so lookups are case-insensitive. */
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  /** argon2id hash. Never returned by the API and never logged. */
  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;
}
