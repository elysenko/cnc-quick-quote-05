import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto, ListQuotesDto } from './quotes.dto';
import { QuoteDetailDto, QuoteListResponse } from './quotes.types';

@Controller('api/quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuoteDto,
  ): Promise<QuoteDetailDto> {
    return this.quotes.create(user.id, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQuotesDto,
  ): Promise<QuoteListResponse> {
    return this.quotes.list(user.id, query);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<QuoteDetailDto> {
    return this.quotes.get(id, user.id);
  }
}
