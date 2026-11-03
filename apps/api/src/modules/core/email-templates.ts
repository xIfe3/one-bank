import { config } from '../../config';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface Block {
  subject: string;
  preheader?: string;
  heading: string;
  paragraphs: string[];
  rows?: [string, string][];
  cta?: { label: string; url: string };
  note?: string;
  tone?: 'default' | 'alert' | 'success';
}

function layout(b: Block): string {
  const accent = b.tone === 'alert' ? '#B42318' : b.tone === 'success' ? '#0E7A4F' : '#C9A227';
  const rows = b.rows?.length
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:20px 0;background:#F7F5EF;border-radius:10px">${b.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:10px 16px;color:#6B7280;font-size:13px;border-bottom:1px solid #ECE7DA">${esc(k)}</td><td style="padding:10px 16px;color:#0B1B3F;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #ECE7DA">${esc(v)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const cta = b.cta
    ? `<p style="margin:28px 0"><a href="${esc(b.cta.url)}" style="background:#C9A227;color:#0B1B3F;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;display:inline-block;font-size:14px">${esc(b.cta.label)}</a></p>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(b.subject)}</title></head>
<body style="margin:0;background:#EEF0F5;font-family:'Libre Franklin','Franklin Gothic Medium','Helvetica Neue',Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(b.preheader ?? b.heading)}</span>
<table role="presentation" width="100%" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(11,27,63,.08)">
<tr><td style="background:#0B1B3F;padding:26px 32px;border-bottom:3px solid ${accent}">
<span style="font-family:'Libre Caslon Text',Georgia,'Times New Roman',serif;font-weight:700;font-size:22px;color:#ffffff;letter-spacing:.3px">One<span style="color:#C9A227">Bank</span></span>
</td></tr>
<tr><td style="padding:34px 32px 10px">
<h1 style="font-family:'Libre Caslon Text',Georgia,'Times New Roman',serif;color:#0B1B3F;font-size:25px;margin:0 0 16px;font-weight:400">${esc(b.heading)}</h1>
${b.paragraphs.map((p) => `<p style="color:#374151;font-size:15px;line-height:1.65;margin:0 0 14px">${p}</p>`).join('')}
${rows}${cta}
${b.note ? `<p style="color:#6B7280;font-size:13px;line-height:1.6;margin:18px 0 0">${b.note}</p>` : ''}
</td></tr>
<tr><td style="padding:24px 32px 30px;border-top:1px solid #F0F0F0;color:#9CA3AF;font-size:12px;line-height:1.6">
One Bank will never ask for your password, PIN or one-time codes by email or phone.<br>
© ${new Date().getFullYear()} One Bank · 1 Gold Street, New York, NY · <a href="${config.webUrl}/help" style="color:#9CA3AF">Help centre</a> · <a href="${config.webUrl}/app/settings/notifications" style="color:#9CA3AF">Email preferences</a>
</td></tr></table></td></tr></table></body></html>`;
}

// Template data is loosely typed on purpose: each template documents the fields it reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;
const web = (p: string) => `${config.webUrl}${p}`;

const templates: Record<string, (d: D) => Block> = {
  'verify-email': (d) => ({
    subject: 'Verify your email address',
    heading: `Welcome, ${d.firstName}`,
    paragraphs: ['Thanks for choosing One Bank. Please confirm your email address to activate your account.'],
    cta: { label: 'Verify email', url: d.url },
    note: 'This link expires in 24 hours. If you did not create a One Bank account, you can ignore this email.',
  }),
  welcome: (d) => ({
    subject: 'Your One Bank account is ready',
    heading: 'You are all set',
    tone: 'success',
    paragraphs: [
      `Hi ${esc(d.firstName)}, your account is active. Your ${esc(d.currency)} account number is <b>${esc(d.accountNumber)}</b>.`,
      'Next steps: set your transaction PIN, turn on two-factor authentication and verify your identity to unlock higher limits.',
    ],
    cta: { label: 'Go to dashboard', url: web('/app') },
  }),
  'new-login': (d) => ({
    subject: 'New sign-in to your One Bank account',
    heading: 'New sign-in detected',
    tone: 'alert',
    paragraphs: [`Hi ${esc(d.firstName)}, we noticed a sign-in from a new device or location.`],
    rows: [
      ['Device', `${d.browser} on ${d.os}`],
      ['Location', d.location],
      ['IP address', d.ip],
      ['Time', d.time],
    ],
    cta: { label: 'This wasn’t me — secure my account', url: d.revokeUrl },
    note: 'If this was you, no action is needed.',
  }),
  'account-locked': (d) => ({
    subject: 'Your account has been temporarily locked',
    heading: 'Too many failed sign-in attempts',
    tone: 'alert',
    paragraphs: [`We locked sign-in to your account for ${esc(d.minutes)} minutes after several failed attempts.`, 'If this was not you, reset your password now.'],
    cta: { label: 'Reset password', url: web('/forgot-password') },
  }),
  'password-reset': (d) => ({
    subject: 'Reset your password',
    heading: 'Password reset request',
    paragraphs: [`Hi ${esc(d.firstName)}, use the button below to choose a new password.`],
    cta: { label: 'Reset password', url: d.url },
    note: 'This link expires in 30 minutes and can be used once. If you did not request it, ignore this email — your password stays the same.',
  }),
  'password-changed': (d) => ({
    subject: 'Your password was changed',
    heading: 'Password changed',
    tone: 'alert',
    paragraphs: [`Hi ${esc(d.firstName)}, your One Bank password was just changed and all other devices were signed out.`, 'If you did not do this, contact support immediately.'],
    cta: { label: 'Contact support', url: web('/contact') },
  }),
  'email-change-confirm': (d) => ({
    subject: 'Confirm your new email address',
    heading: 'Confirm email change',
    paragraphs: ['Click below to confirm this as the new email address for your One Bank account.'],
    cta: { label: 'Confirm new email', url: d.url },
    note: 'This link expires in 1 hour.',
  }),
  'email-change-alert': (d) => ({
    subject: 'Your email address is being changed',
    heading: 'Email change requested',
    tone: 'alert',
    paragraphs: [`A request was made to change your account email to <b>${esc(d.newEmail)}</b>. If this was not you, secure your account now.`],
    cta: { label: 'Contact support', url: web('/contact') },
  }),
  'two-factor': (d) => ({
    subject: `Two-factor authentication ${d.enabled ? 'enabled' : 'disabled'}`,
    heading: `Two-factor authentication ${d.enabled ? 'enabled' : 'disabled'}`,
    tone: d.enabled ? 'success' : 'alert',
    paragraphs: [d.enabled ? 'Your account is now protected with an authenticator app.' : 'Two-factor authentication was turned off for your account. If this was not you, contact support.'],
  }),
  'pin-reset': (d) => ({
    subject: 'Your transaction PIN reset code',
    heading: 'Reset your transaction PIN',
    paragraphs: ['Use this code to reset your transaction PIN:', `<span style="font-size:30px;letter-spacing:8px;font-weight:700;color:#0B1B3F">${esc(d.code)}</span>`],
    note: 'The code expires in 15 minutes.',
  }),
  otp: (d) => ({
    subject: 'Your One Bank verification code',
    heading: 'Verification code',
    paragraphs: [`Use this code to ${esc(d.purpose ?? 'confirm your transaction')}:`, `<span style="font-size:30px;letter-spacing:8px;font-weight:700;color:#0B1B3F">${esc(d.code)}</span>`],
    note: 'The code expires in 10 minutes. Never share it with anyone.',
  }),
  'money-received': (d) => ({
    subject: `You received ${d.amount}`,
    heading: 'Money received',
    tone: 'success',
    paragraphs: [`Hi ${esc(d.firstName)}, your account has been credited.`],
    rows: [
      ['Amount', d.amount],
      ['From', d.from],
      ['Description', d.description],
      ['Reference', d.reference],
      ['New balance', d.balance],
    ],
    cta: { label: 'View transaction', url: web(`/app/transactions/${d.entryId}`) },
  }),
  'money-sent': (d) => ({
    subject: `Debit alert: ${d.amount}`,
    heading: d.status === 'PENDING' ? 'Transfer submitted' : 'Debit alert',
    paragraphs: [`Hi ${esc(d.firstName)}, ${d.status === 'PENDING' ? 'your transfer is being processed.' : 'your account has been debited.'}`],
    rows: [
      ['Amount', d.amount],
      ...(d.fee ? ([['Fee', d.fee]] as [string, string][]) : []),
      ['To', d.to],
      ['Description', d.description],
      ['Reference', d.reference],
      ['Status', d.status],
      ['Available balance', d.balance],
    ],
    cta: { label: 'View receipt', url: web(`/app/transactions/${d.entryId}`) },
  }),
  'transfer-status': (d) => ({
    subject: `Transfer ${String(d.status).toLowerCase()}: ${d.amount}`,
    heading: `Transfer ${String(d.status).toLowerCase()}`,
    tone: d.status === 'COMPLETED' ? 'success' : d.status === 'FAILED' || d.status === 'REJECTED' ? 'alert' : 'default',
    paragraphs: [
      d.status === 'COMPLETED'
        ? `Your transfer of ${esc(d.amount)} to ${esc(d.to)} has been completed.`
        : d.status === 'AWAITING_REVIEW'
          ? `Your transfer of ${esc(d.amount)} to ${esc(d.to)} is undergoing a routine security review. We will notify you once it is complete.`
          : `Your transfer of ${esc(d.amount)} to ${esc(d.to)} could not be completed${d.reason ? `: ${esc(d.reason)}` : ''}. Any funds held have been returned to your account.`,
    ],
    rows: [['Reference', d.reference]],
    cta: { label: 'View transfer', url: web(`/app/transactions/${d.entryId}`) },
  }),
  'transaction-reversed': (d) => ({
    subject: `Transaction reversed: ${d.reference}`,
    heading: 'Transaction reversed',
    paragraphs: [`The transaction ${esc(d.reference)} (${esc(d.amount)}) has been reversed. ${d.reason ? `Reason: ${esc(d.reason)}` : ''}`],
    cta: { label: 'View account', url: web('/app/transactions') },
  }),
  'bill-paid': (d) => ({
    subject: `${d.provider} payment successful`,
    heading: 'Bill payment successful',
    tone: 'success',
    paragraphs: [`Your ${esc(d.provider)} payment was successful.`],
    rows: [['Amount', d.amount], ['Customer', `${d.customerName} (${d.customerId})`], ...(d.token ? ([['Token', d.token]] as [string, string][]) : []), ['Reference', d.reference]],
    cta: { label: 'View receipt', url: web(`/app/transactions/${d.entryId}`) },
  }),
  'card-event': (d) => ({
    subject: d.subject,
    heading: d.subject,
    tone: d.tone ?? 'default',
    paragraphs: [esc(d.message)],
    rows: d.rows,
    cta: { label: 'Manage cards', url: web('/app/cards') },
  }),
  'low-balance': (d) => ({
    subject: 'Low balance alert',
    heading: 'Your balance is running low',
    tone: 'alert',
    paragraphs: [`Your ${esc(d.currency)} account ending ${esc(d.last4)} has an available balance of <b>${esc(d.balance)}</b>.`],
    cta: { label: 'Add money', url: web('/app/accounts') },
  }),
  'kyc-result': (d) => ({
    subject: d.approved ? 'Identity verification approved' : 'Identity verification needs attention',
    heading: d.approved ? 'You are verified' : 'We could not verify your documents',
    tone: d.approved ? 'success' : 'alert',
    paragraphs: [d.approved ? `Your account has been upgraded to level ${esc(d.level)}. Higher limits are now available.` : `Reason: ${esc(d.note)}. Please resubmit clear, valid documents.`],
    cta: { label: d.approved ? 'See my limits' : 'Resubmit documents', url: web(d.approved ? '/app/settings/limits' : '/app/settings/kyc') },
  }),
  'savings-event': (d) => ({
    subject: d.subject,
    heading: d.subject,
    tone: 'success',
    paragraphs: [esc(d.message)],
    cta: { label: 'View savings', url: web('/app/savings') },
  }),
  'loan-event': (d) => ({
    subject: d.subject,
    heading: d.subject,
    tone: d.tone ?? 'default',
    paragraphs: [esc(d.message)],
    rows: d.rows,
    cta: { label: 'View loans', url: web('/app/loans') },
  }),
  'ticket-update': (d) => ({
    subject: `[Ticket #${d.number}] ${d.subject}`,
    heading: d.resolved ? 'Your request has been resolved' : 'New reply from One Bank support',
    paragraphs: [d.resolved ? `Ticket #${esc(d.number)} has been marked as resolved. Reply in the app if you still need help.` : `<i>${esc(d.preview)}</i>`],
    cta: { label: 'View conversation', url: web(`/app/support/${d.ticketId}`) },
  }),
  'ticket-created': (d) => ({
    subject: `[Ticket #${d.number}] We received your request`,
    heading: 'We are on it',
    paragraphs: [`Thanks for reaching out. Your ticket <b>#${esc(d.number)} — ${esc(d.subject)}</b> has been created and our team will respond shortly.`],
    cta: { label: 'View ticket', url: web(`/app/support/${d.ticketId}`) },
  }),
  'account-status': (d) => ({
    subject: d.subject,
    heading: d.subject,
    tone: d.tone ?? 'alert',
    paragraphs: [esc(d.message), ...(d.reason ? [`Reason: ${esc(d.reason)}`] : [])],
    cta: { label: 'Contact support', url: web('/contact') },
  }),
  broadcast: (d) => ({
    subject: d.title,
    heading: d.title,
    paragraphs: String(d.body)
      .split(/\n{2,}/)
      .map((p) => esc(p).replace(/\n/g, '<br>')),
    cta: d.link ? { label: 'Learn more', url: d.link.startsWith('http') ? d.link : web(d.link) } : undefined,
  }),
  statement: (d) => ({
    subject: `Your One Bank statement (${d.period})`,
    heading: 'Your statement is attached',
    paragraphs: [`Hi ${esc(d.firstName)}, your statement for account ${esc(d.accountNumber)} covering ${esc(d.period)} is attached as a PDF.`],
  }),
  'admin-invite': (d) => ({
    subject: 'You have been invited to One Bank Admin',
    heading: 'Admin console invitation',
    paragraphs: [`Hi ${esc(d.firstName)}, you have been invited to the One Bank admin console as <b>${esc(d.role)}</b>.`],
    cta: { label: 'Accept invitation', url: d.url },
    note: 'This invitation expires in 72 hours.',
  }),
  contact: (d) => ({
    subject: 'We received your message',
    heading: 'Thanks for contacting One Bank',
    paragraphs: [`Hi ${esc(d.name)}, we have received your message about “${esc(d.subject)}” and will reply within one business day.`],
  }),
};

export function renderEmail(template: string, data: D): { subject: string; html: string } {
  const fn = templates[template];
  if (!fn) throw new Error(`Unknown email template ${template}`);
  const block = fn(data);
  return { subject: block.subject, html: layout(block) };
}

export const EMAIL_TEMPLATES = Object.keys(templates);
