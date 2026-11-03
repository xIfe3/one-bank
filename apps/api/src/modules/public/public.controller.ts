import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { contactSchema, newsletterSchema } from '@onebank/shared';
import { parse } from '../../common/http';
import { PrismaService } from '../../common/infra';
import { FxService } from '../core/fx.service';
import { MailService } from '../core/mail.service';
import { SettingsService } from '../core/settings.service';

/** Unauthenticated endpoints used by the marketing site and status checks. */
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly fx: FxService,
    private readonly mail: MailService,
  ) {}

  @Get('status')
  status() {
    return this.settings.publicStatus();
  }

  @Get('fx-rates')
  rates() {
    return this.fx.publicRates();
  }

  @Get('faqs')
  faqs(@Query('q') q?: string) {
    return this.prisma.faq.findMany({
      where: { published: true, ...(q ? { OR: [{ question: { contains: q, mode: 'insensitive' } }, { answer: { contains: q, mode: 'insensitive' } }] } : {}) },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
  }

  @Get('loan-products')
  loanProducts() {
    return this.prisma.loanProduct.findMany({ where: { active: true }, orderBy: { maxAmount: 'asc' } });
  }

  @Get('announcements')
  announcements() {
    const now = new Date();
    return this.prisma.announcement.findMany({ where: { active: true, variant: 'PROMO', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, take: 1, orderBy: { createdAt: 'desc' } });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('contact')
  async contact(@Body() body: unknown) {
    const input = parse(contactSchema, body);
    await this.prisma.contactMessage.create({ data: input });
    await this.mail.send(input.email, 'contact', { name: input.name, subject: input.subject });
    return { message: 'Thanks! We will get back to you within one business day.' };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('newsletter')
  async newsletter(@Body() body: unknown) {
    const { email } = parse(newsletterSchema, body);
    await this.prisma.newsletterSubscriber.upsert({ where: { email }, create: { email }, update: {} });
    return { message: 'You are subscribed. Welcome aboard!' };
  }
}
