import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../../config';
import { PrismaService } from '../../common/infra';
import { renderEmail } from './email-templates';
import { QueueService } from './queue.service';

export interface Attachment {
  filename: string;
  /** base64 content */
  content: string;
  contentType: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger('Mail');
  private transporter: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }

  onModuleInit() {
    this.queues.process('email', async (job) => this.deliver(job.data.logId, job.data.attachments));
  }

  /** Render, log and enqueue an email. Retries with exponential backoff (5 attempts). */
  async send(to: string, template: string, data: Record<string, unknown>, attachments?: Attachment[]) {
    const { subject, html } = renderEmail(template, data);
    const log = await this.prisma.emailLog.create({ data: { to, subject, template, html } });
    const job = await this.queues.add('email', template, { logId: log.id, attachments }, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
    if (!job && !config.disableWorkers) await this.deliver(log.id, attachments);
    return log;
  }

  async resend(logId: string) {
    await this.prisma.emailLog.update({ where: { id: logId }, data: { status: 'QUEUED', error: null } });
    await this.queues.add('email', 'resend', { logId }, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
  }

  async deliver(logId: string, attachments?: Attachment[]) {
    const log = await this.prisma.emailLog.findUnique({ where: { id: logId } });
    if (!log || log.status === 'SENT') return;
    try {
      await this.transporter.sendMail({
        from: config.mailFrom,
        to: log.to,
        subject: log.subject,
        html: log.html,
        attachments: attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, 'base64'), contentType: a.contentType })),
      });
      await this.prisma.emailLog.update({ where: { id: logId }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, error: null } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Email ${logId} to ${log.to} failed: ${msg}`);
      await this.prisma.emailLog.update({ where: { id: logId }, data: { status: 'FAILED', error: msg.slice(0, 500), attempts: { increment: 1 } } });
      throw e;
    }
  }
}
