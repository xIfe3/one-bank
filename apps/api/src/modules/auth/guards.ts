import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole, AdminUser, User } from '@prisma/client';
import type { Request } from 'express';
import { config } from '../../config';
import { AppError } from '../../common/app-error';
import { clientIp } from '../../common/http';
import { PrismaService } from '../../common/infra';
import { SessionService } from './session.service';

export interface AuthedRequest extends Request {
  user?: User;
  admin?: AdminUser;
  sessionId?: string;
}

/** Customer auth: valid access JWT + live session + user not blocked/closed. */
@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[this.sessions.cookieNames('user').access] as string | undefined;
    const claims = token ? this.sessions.verifyAccess(token, 'user') : null;
    if (!claims || !(await this.sessions.isActive(claims.sid))) throw new AppError('UNAUTHORIZED', 'Your session has expired. Please sign in again.');
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user) throw new AppError('UNAUTHORIZED', 'Please sign in again.');
    if (user.status === 'BLOCKED' || user.status === 'CLOSED') {
      await this.sessions.revokeWhere({ userId: user.id }, `Account ${user.status.toLowerCase()}`);
      throw new AppError('ACCOUNT_BLOCKED', 'Your account has been blocked. Please contact support.');
    }
    req.user = user;
    req.sessionId = claims.sid;
    return true;
  }
}

export const ROLES_KEY = 'admin_roles';
/** Restrict an admin route to these roles (SUPERADMIN always passes). */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (config.adminIpAllowlist.length && !config.adminIpAllowlist.includes(clientIp(req))) {
      throw new AppError('FORBIDDEN', 'Access from this network is not allowed.');
    }
    const token = req.cookies?.[this.sessions.cookieNames('admin').access] as string | undefined;
    const claims = token ? this.sessions.verifyAccess(token, 'admin') : null;
    if (!claims || !(await this.sessions.isActive(claims.sid))) throw new AppError('UNAUTHORIZED', 'Admin session expired. Please sign in again.');
    const admin = await this.prisma.adminUser.findUnique({ where: { id: claims.sub } });
    if (!admin || admin.status !== 'ACTIVE') throw new AppError('UNAUTHORIZED', 'Admin account is not active.');
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && admin.role !== 'SUPERADMIN' && !roles.includes(admin.role)) {
      throw new AppError('FORBIDDEN', 'Your role does not have permission for this action.');
    }
    req.admin = admin;
    req.sessionId = claims.sid;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user!);
export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().admin!);
export const SessionId = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().sessionId!);
