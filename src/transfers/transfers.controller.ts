import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
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
  CreateTransferDto,
  TransferResponse,
  UpdateTransferDto,
} from './transfer.dto.js';
import { toTransferResponse } from './transfer.mapper.js';
import { TransfersService } from './transfers.service.js';

/** An id that is not a UUID can never match a transfer, so it is a plain 404. */
const IdPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

const createExample = {
  recipientId: '0b8f9a7e-3c52-4c8e-9a52-6d9a1f6a1b11',
  transferDate: '2026-11-01',
  sent: { amount: '15000', currency: 'GBP' },
  fee: { amount: '350', currency: 'GBP' },
  receivingCurrency: 'NGN',
  exchangeRate: '1950.5',
  provider: 'Wise',
  purpose: 'Family support',
  status: 'completed',
  notes: 'Rent contribution',
};

@ApiTags('transfers')
@Auth()
@Controller({ path: 'transfers', version: '1' })
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a transfer',
    description:
      'Money uses the ADR 0004 wire format: amounts are whole minor units as strings (`"15000"` with GBP is 150.00) and the exchange rate is a decimal string. The fee is in the sending currency. Statuses: `pending`, `completed`, `failed`, `cancelled`.',
  })
  @ApiBody({
    type: CreateTransferDto,
    examples: {
      typical: {
        summary: 'A completed GBP to NGN transfer',
        value: createExample,
      },
    },
  })
  @ApiCreatedResponse({ type: TransferResponse })
  @ApiBadRequestResponse({
    description:
      'Invalid input. The body has `message` (flat list) and `errors` (`[{ field, messages }]`).',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferResponse> {
    return toTransferResponse(await this.transfers.create(user.id, dto));
  }

  @Get()
  @ApiOperation({ summary: "List the current user's transfers, newest first" })
  @ApiOkResponse({ type: [TransferResponse] })
  async list(@CurrentUser() user: AuthUser): Promise<TransferResponse[]> {
    return (await this.transfers.list(user.id)).map(toTransferResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one transfer' })
  @ApiOkResponse({ type: TransferResponse })
  @ApiNotFoundResponse({
    description: 'Not found, or belongs to another user.',
  })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: string,
  ): Promise<TransferResponse> {
    return toTransferResponse(await this.transfers.get(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a transfer (partial; `sent` and `fee` are replaced whole)',
  })
  @ApiOkResponse({ type: TransferResponse })
  @ApiBadRequestResponse({
    description: 'Invalid fields, unknown fields or an empty body.',
  })
  @ApiNotFoundResponse({
    description: 'Not found, or belongs to another user.',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateTransferDto,
  ): Promise<TransferResponse> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Provide at least one field to update.');
    }
    return toTransferResponse(await this.transfers.update(user.id, id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a transfer' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiNotFoundResponse({
    description: 'Not found, or belongs to another user.',
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.transfers.remove(user.id, id);
  }
}
