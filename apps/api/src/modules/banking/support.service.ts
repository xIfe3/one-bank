import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AppError, notFound } from '../../common/app-error';
import { PrismaService } from '../../common/infra';
import { MailService } from '../core/mail.service';
import { NotificationsService } from '../core/notifications.service';

export interface Upload {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  list(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { lastActivityAt: 'desc' },
      include: { messages: { where: { internal: false }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async get(userId: string, id: string) {
    const t = await this.prisma.supportTicket.findFirst({
      where: { id, userId },
      include: { messages: { where: { internal: false }, orderBy: { createdAt: 'asc' } }, assignedAdmin: { select: { firstName: true } } },
    });
    if (!t) throw notFound('Ticket');
    return t;
  }

  async create(user: User, input: { subject: string; category: string; priority: string; message: string; journalEntryId?: string }, files: Upload[] = []) {
    if (input.journalEntryId) {
      const owns = await this.prisma.posting.findFirst({ where: { entryId: input.journalEntryId, account: { ownerId: user.id } } });
      const ownsTransfer = await this.prisma.transfer.findFirst({ where: { entryId: input.journalEntryId, userId: user.id } });
      if (!owns && !ownsTransfer) throw notFound('Transaction');
    }
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject: input.subject,
        category: input.category,
        priority: input.priority,
        journalEntryId: input.journalEntryId,
        messages: {
          create: [
            { authorType: 'USER', authorId: user.id, authorName: `${user.firstName} ${user.lastName}`, body: input.message, attachments: this.attachments(files) as never },
            {
              authorType: 'SYSTEM',
              authorName: 'One Bank',
              body: 'Thanks for contacting us. A support specialist will respond shortly — typical response time is under 4 hours.',
            },
          ],
        },
      },
    });
    await this.notifications.notify(user.id, {
      category: 'SUPPORT',
      type: 'TICKET_CREATED',
      title: `Ticket #${ticket.number} created`,
      body: input.subject,
      link: `/app/support/${ticket.id}`,
      email: { template: 'ticket-created', data: { number: ticket.number, subject: input.subject, ticketId: ticket.id } },
    });
    return ticket;
  }

  attachments(files: Upload[]) {
    return files.map((f) => ({ name: f.originalname, file: f.filename, type: f.mimetype, size: f.size }));
  }

  async reply(user: User, id: string, body: string, files: Upload[] = []) {
    const t = await this.get(user.id, id);
    if (t.status === 'CLOSED') throw new AppError('CONFLICT', 'This ticket is closed. Reopen it or create a new one.');
    await this.prisma.ticketMessage.create({
      data: { ticketId: t.id, authorType: 'USER', authorId: user.id, authorName: `${user.firstName} ${user.lastName}`, body, attachments: this.attachments(files) as never },
    });
    await this.prisma.supportTicket.update({ where: { id: t.id }, data: { status: t.status === 'RESOLVED' || t.status === 'PENDING' ? 'OPEN' : t.status, lastActivityAt: new Date() } });
    return this.get(user.id, id);
  }

  async setStatus(user: User, id: string, status: 'CLOSED' | 'OPEN') {
    const t = await this.get(user.id, id);
    await this.prisma.supportTicket.update({ where: { id: t.id }, data: { status, lastActivityAt: new Date(), ...(status === 'CLOSED' ? { resolvedAt: t.resolvedAt ?? new Date() } : {}) } });
    await this.prisma.ticketMessage.create({ data: { ticketId: t.id, authorType: 'SYSTEM', authorName: 'One Bank', body: status === 'CLOSED' ? 'Ticket closed by customer.' : 'Ticket reopened by customer.' } });
    return this.get(user.id, id);
  }

  /** Admin reply (optionally internal note) — used by the admin module. */
  async adminReply(adminId: string, adminName: string, id: string, body: string, internal: boolean, files: Upload[] = [], status?: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, include: { user: true } });
    if (!t) throw notFound('Ticket');
    await this.prisma.ticketMessage.create({ data: { ticketId: id, authorType: 'ADMIN', authorId: adminId, authorName: adminName, body, internal, attachments: this.attachments(files) as never } });
    const nextStatus = status ?? (internal ? t.status : 'PENDING');
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: nextStatus,
        lastActivityAt: new Date(),
        firstResponseAt: !internal && !t.firstResponseAt ? new Date() : undefined,
        assignedAdminId: t.assignedAdminId ?? adminId,
        resolvedAt: nextStatus === 'RESOLVED' ? new Date() : undefined,
      },
    });
    if (!internal) {
      await this.notifications.notify(t.userId, {
        category: 'SUPPORT',
        type: 'TICKET_REPLY',
        title: `New reply on ticket #${t.number}`,
        body: body.slice(0, 140),
        link: `/app/support/${t.id}`,
        email: { template: 'ticket-update', data: { number: t.number, subject: t.subject, preview: body.slice(0, 300), ticketId: t.id, resolved: nextStatus === 'RESOLVED' } },
      });
    }
  }
}
