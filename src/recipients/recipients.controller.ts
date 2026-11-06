import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  CreateRecipientDto,
  RecipientResponse,
  UpdateRecipientDto,
} from './recipient.dto.js';
import { RecipientsService } from './recipients.service.js';

/** An id that is not a UUID can never match a recipient, so it is a plain 404. */
const IdPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@ApiTags('recipients')
@Auth()
@Controller({ path: 'recipients', version: '1' })
export class RecipientsController {
  constructor(private readonly recipients: RecipientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a recipient' })
  @ApiCreatedResponse({ type: RecipientResponse })
  @ApiBadRequestResponse({
    description: 'Empty name, invalid country code or unknown fields.',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRecipientDto,
  ): Promise<RecipientResponse> {
    return RecipientResponse.from(await this.recipients.create(user.id, dto));
  }

  @Get()
  @ApiOperation({ summary: "List the current user's recipients" })
  @ApiOkResponse({ type: [RecipientResponse] })
  async list(@CurrentUser() user: AuthUser): Promise<RecipientResponse[]> {
    return (await this.recipients.list(user.id)).map((r) =>
      RecipientResponse.from(r),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one recipient' })
  @ApiOkResponse({ type: RecipientResponse })
  @ApiNotFoundResponse({
    description: 'Not found, or belongs to another user.',
  })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: string,
  ): Promise<RecipientResponse> {
    return RecipientResponse.from(await this.recipients.get(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a recipient (partial)' })
  @ApiOkResponse({ type: RecipientResponse })
  @ApiBadRequestResponse({
    description: 'Invalid fields, unknown fields or an empty body.',
  })
  @ApiNotFoundResponse({
    description: 'Not found, or belongs to another user.',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateRecipientDto,
  ): Promise<RecipientResponse> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Provide at least one field to update.');
    }
    return RecipientResponse.from(
      await this.recipients.update(user.id, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a recipient' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiNotFoundResponse({
    description: 'Not found, or belongs to another user.',
  })
  @ApiConflictResponse({ description: 'The recipient still has transfers.' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.recipients.remove(user.id, id);
  }
}
