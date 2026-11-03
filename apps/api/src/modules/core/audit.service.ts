import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/infra';

export interface AuditActor {
  type: 'ADMIN' | 'USER' | 'SYSTEM';
  id?: string;
  email?: string;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    actor: AuditActor,
    action: string,
    target?: { type: string; id: string },
    extra: { reason?: string; before?: unknown; after?: unknown } = {},
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorType: actor.type,
        actorId: actor.id,
        actorEmail: actor.email,
        ip: actor.ip,
        action,
        targetType: target?.type,
        targetId: target?.id,
        reason: extra.reason,
        before: extra.before === undefined ? undefined : JSON.parse(JSON.stringify(extra.before)),
        after: extra.after === undefined ? undefined : JSON.parse(JSON.stringify(extra.after)),
      },
    });
  }
}
