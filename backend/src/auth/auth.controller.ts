import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthenticatedUser, PublicUser, SessionResponse } from './auth.types';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto';

export const REFRESH_COOKIE = 'cnc_refresh';

@Controller('api/auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { session, refreshToken } = await this.auth.register(dto);
    this.setRefreshCookie(res, refreshToken);
    return session;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { session, refreshToken } = await this.auth.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return session;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const { session, refreshToken } = await this.auth.refresh(presented);
    this.setRefreshCookie(res, refreshToken);
    return session;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(presented);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser): Promise<{ user: PublicUser }> {
    const user = await this.auth.findById(current.id);
    if (!user) throw new NotFoundException('Account no longer exists.');
    return { user: AuthService.toPublicUser(user) };
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<{ user: PublicUser }> {
    return { user: await this.auth.updateProfile(current.id, dto.name?.trim() || null) };
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(current.id, dto.currentPassword, dto.newPassword);
  }

  /**
   * HttpOnly so script cannot read it, SameSite=Strict so it never rides a
   * cross-site request. Secure only outside development, or a plain-HTTP
   * local run would silently drop it.
   */
  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: AuthService.refreshCookieMaxAgeMs,
    });
  }
}
