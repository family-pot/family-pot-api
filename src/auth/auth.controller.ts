import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StrictRateLimit } from '../common/rate-limit.js';
import { AppConfigService } from '../config/app-config.service.js';
import { UsersService } from '../users/users.service.js';
import { Auth, CurrentUser } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import { CurrentUserResponse, LoginDto, LoginResponse } from './login.dto.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  type RefreshCookieSettings,
} from './refresh-cookie.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { RegisterDto, RegisterResponse } from './register.dto.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  private cookieSettings(): RefreshCookieSettings {
    return {
      production: this.config.nodeEnv === 'production',
      sameSite: this.config.refreshCookieSameSite,
      maxAgeMs: this.refreshTokens.lifetimeMs,
    };
  }

  @Post('register')
  @StrictRateLimit()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register a user',
    description:
      'Email and password. The response contains only the id and email, never the password or its hash.',
  })
  @ApiCreatedResponse({ type: RegisterResponse })
  @ApiBadRequestResponse({
    description: 'Invalid email, weak password or unknown fields.',
  })
  @ApiConflictResponse({
    description: 'Registration could not be completed (generic on purpose).',
  })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    const user = await this.users.register(dto.email, dto.password);
    return { id: user.id, email: user.email };
  }

  @Post('login')
  @StrictRateLimit()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Returns a short-lived access token. A wrong password and an unknown email give the same response.',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiBadRequestResponse({ description: 'Malformed request body.' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const { refreshToken, ...tokens } = await this.auth.login(
      dto.email,
      dto.password,
    );
    setRefreshCookie(response, refreshToken, this.cookieSettings());
    return tokens;
  }

  @Post('refresh')
  @StrictRateLimit()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Refresh the access token',
    description:
      'Reads the refresh token from the httpOnly `refresh_token` cookie and rotates it: the old token stops working and a new cookie is set. Presenting an already-rotated token revokes the whole session (token family).',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or reused refresh token.',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    try {
      const { refreshToken, ...tokens } = await this.auth.refresh(
        readRefreshCookie(request),
      );
      setRefreshCookie(response, refreshToken, this.cookieSettings());
      return tokens;
    } catch (error) {
      clearRefreshCookie(response, this.cookieSettings());
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the whole session of the refresh token in the cookie and clears the cookie. Always 204, whether or not a valid token was sent.',
  })
  @ApiNoContentResponse({ description: 'Logged out.' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(response, this.cookieSettings());
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'The current user' })
  @ApiOkResponse({ type: CurrentUserResponse })
  me(@CurrentUser() user: AuthUser): CurrentUserResponse {
    return user;
  }
}
