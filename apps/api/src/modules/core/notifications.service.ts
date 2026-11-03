import { Injectable, OnModuleInit } from '@nestjs/common';
import type { NotificationCategory } from '@onebank/shared';
import { Observable, Subject, filter, map } from 'rxjs';
import { PrismaService, RedisService } from '../../common/infra';
import { MailService, type Attachment } from './mail.service';

export interface NotifyInput {
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link?: string;
  email?: { template: string; data: Record<string, unknown>; attachments?: Attachment[] };
  /** In-app only, never email (e.g. low-signal events). */
  skipEmail?: boolean;
}

interface LiveEvent {
  userId: string;
  kind: 'notification' | 'balance' | 'session';
  payload: unknown;
}

const CHANNEL = 'onebank:live';

/** Fan-out of in-app notifications + email per preferences. SECURITY is always delivered. */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly live = new Subject<LiveEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit() {
    await this.redis.subscriber.subscribe(CHANNEL);
    this.redis.subscriber.on('message', (channel, message) => {
      if (channel === CHANNEL) this.live.next(JSON.parse(message) as LiveEvent);
    });
  }

  stream(userId: string): Observable<{ data: unknown; type: string }> {
    return this.live.pipe(
      filter((e) => e.userId === userId),
      map((e) => ({ type: e.kind, data: e.payload })),
    );
  }

  publish(userId: string, kind: LiveEvent['kind'], payload: unknown) {
    return this.redis.client.publish(CHANNEL, JSON.stringify({ userId, kind, payload }));
  }

  async notify(userId: string, input: NotifyInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
    if (!user) return;
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId_category: { userId, category: input.category } } });
    const mandatory = input.category === 'SECURITY';
    const inApp = mandatory || (pref?.inApp ?? true);
    const email = !input.skipEmail && input.email && (mandatory || (pref?.email ?? true));

    if (inApp) {
      const n = await this.prisma.notification.create({
        data: { userId, category: input.category, type: input.type, title: input.title, body: input.body, link: input.link },
      });
      await this.publish(userId, 'notification', n);
    }
    if (email && input.email) {
      await this.mail.send(user.email, input.email.template, { firstName: user.firstName, ...input.email.data }, input.email.attachments);
    }
  }

  balanceChanged(userId: string) {
    return this.publish(userId, 'balance', { at: Date.now() });
  }
}
