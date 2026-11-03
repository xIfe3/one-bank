import { Controller, Get, Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CsrfMiddleware, RequestIdMiddleware } from './common/http';
import { PrismaService, RedisService } from './common/infra';
import { AdminAuthController } from './modules/admin/admin-auth.controller';
import { AdminLedgerController, AdminOpsController, AdminOverviewController, AdminPlatformController, AdminUsersController } from './modules/admin/admin.controller';
import { AdminService } from './modules/admin/admin.service';
import { AuthController, CsrfController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { AdminAuthGuard, UserAuthGuard } from './modules/auth/guards';
import { SessionService } from './modules/auth/session.service';
import { AccountsService } from './modules/banking/accounts.service';
import { AccountsController, FxController, KycController, LoansController, ProductsController, SupportController, TransfersController } from './modules/banking/banking.controller';
import { FraudService } from './modules/banking/fraud.service';
import { InsightsService } from './modules/banking/insights.service';
import { LoansService } from './modules/banking/loans.service';
import { PdfService } from './modules/banking/pdf.service';
import { ProductsService } from './modules/banking/products.service';
import { SchedulerService } from './modules/banking/scheduler.service';
import { SupportService } from './modules/banking/support.service';
import { TransfersService } from './modules/banking/transfers.service';
import { AuditService } from './modules/core/audit.service';
import { FxService } from './modules/core/fx.service';
import { LedgerService } from './modules/core/ledger.service';
import { MailService } from './modules/core/mail.service';
import { MaintenanceMiddleware } from './modules/core/maintenance.middleware';
import { MoneyGuardService } from './modules/core/money-guard.service';
import { NotificationsService } from './modules/core/notifications.service';
import { QueueService } from './modules/core/queue.service';
import { SettingsService } from './modules/core/settings.service';
import { MeController } from './modules/me/me.controller';
import { PublicController } from './modules/public/public.controller';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date().toISOString() };
  }
}

/** Shared infrastructure + domain services used across all feature controllers. */
@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    QueueService,
    SettingsService,
    AuditService,
    MailService,
    NotificationsService,
    LedgerService,
    FxService,
    MoneyGuardService,
    SessionService,
    AuthService,
    UserAuthGuard,
    AdminAuthGuard,
  ],
  exports: [
    PrismaService,
    RedisService,
    QueueService,
    SettingsService,
    AuditService,
    MailService,
    NotificationsService,
    LedgerService,
    FxService,
    MoneyGuardService,
    SessionService,
    AuthService,
    UserAuthGuard,
    AdminAuthGuard,
  ],
})
class CoreModule {}

@Module({
  imports: [CoreModule, ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Integration tests drive many sign-ups from one IP.
      skipIf: () => process.env.NODE_ENV === 'test',
    })],
  controllers: [
    HealthController,
    CsrfController,
    AuthController,
    MeController,
    PublicController,
    AccountsController,
    TransfersController,
    FxController,
    ProductsController,
    LoansController,
    SupportController,
    KycController,
    AdminAuthController,
    AdminOverviewController,
    AdminUsersController,
    AdminLedgerController,
    AdminOpsController,
    AdminPlatformController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AccountsService,
    TransfersService,
    FraudService,
    ProductsService,
    LoansService,
    PdfService,
    SupportService,
    InsightsService,
    SchedulerService,
    AdminService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, CsrfMiddleware, MaintenanceMiddleware).forRoutes('*');
  }
}
