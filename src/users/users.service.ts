import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PasswordService } from './password.service.js';
import { User } from './user.entity.js';

/** Postgres error code for a unique constraint violation. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
  ) {}

  async register(email: string, password: string): Promise<User> {
    // Hash before touching the database so a duplicate email costs the same
    // time as a new one.
    const passwordHash = await this.passwords.hash(password);
    try {
      return await this.users.save(
        this.users.create({ email: email.toLowerCase(), passwordHash }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        // Deliberately generic: does not say that the email is registered.
        throw new ConflictException('Registration could not be completed.');
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: email.toLowerCase() });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }
}
