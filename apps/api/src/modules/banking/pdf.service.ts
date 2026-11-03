import { Injectable } from '@nestjs/common';
import { ENTRY_TYPE_LABELS, formatMoney, type EntryType } from '@onebank/shared';
import Decimal from 'decimal.js';
import PDFDocument from 'pdfkit';
import { AppError, notFound } from '../../common/app-error';
import { PrismaService } from '../../common/infra';
import { AccountsService } from './accounts.service';

const NAVY = '#0B1B3F';
const GOLD = '#C9A227';
const GREY = '#6B7280';

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

const fmtDate = (d: Date) => d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

@Injectable()
export class PdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  private header(doc: PDFKit.PDFDocument, title: string) {
    doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Times-Bold').fontSize(24).text('One', 50, 32, { continued: true }).fillColor(GOLD).text('Bank');
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text(title.toUpperCase(), 50, 40, { align: 'right', width: doc.page.width - 100, characterSpacing: 1.5 });
    doc.rect(0, 90, doc.page.width, 3).fill(GOLD);
    doc.fillColor(NAVY);
    doc.y = 120;
  }

  private footer(doc: PDFKit.PDFDocument) {
    const y = doc.page.height - 60;
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text('One Bank · [Company legal name] · [Registered address] · [Banking licence / partner-bank disclosure]', 50, y, { align: 'center', width: doc.page.width - 100 });
  }

  async receipt(userId: string | null, entryId: string): Promise<Buffer> {
    const tx = await this.accounts.transaction(userId, entryId);
    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    this.header(doc, 'Transaction receipt');
    const leg = tx.legs.find((l) => l.accountType !== 'SYSTEM') ?? tx.pendingLegs[0] ?? tx.legs[0];
    const amount = leg ? formatMoney(new Decimal(leg.amount).abs(), leg.currency) : '';
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text('Amount', { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(26).fillColor(NAVY).text(amount, { align: 'center' });
    const statusColor = tx.status === 'COMPLETED' ? '#0E7A4F' : tx.status === 'PENDING' ? '#B7791F' : '#B42318';
    doc.font('Helvetica-Bold').fontSize(10).fillColor(statusColor).text(tx.transfer?.status ?? tx.status, { align: 'center' });
    doc.moveDown(1.2);
    const rows: [string, string][] = [
      ['Reference', tx.reference],
      ['Type', ENTRY_TYPE_LABELS[tx.type as EntryType] ?? tx.type],
      ['Date', fmtDate(tx.valueDate)],
      ['Description', tx.description],
    ];
    if (tx.counterpartyName) rows.push(['Counterparty', tx.counterpartyName]);
    if (tx.counterpartyAccount) rows.push(['Counterparty account', tx.counterpartyAccount]);
    if (tx.counterpartyBank) rows.push(['Counterparty bank', tx.counterpartyBank]);
    if (tx.transfer?.fee && Number(tx.transfer.fee) > 0) rows.push(['Fee', formatMoney(tx.transfer.fee, tx.transfer.currency)]);
    if (tx.billPayment?.token) rows.push(['Token', tx.billPayment.token]);
    if (leg?.accountNumber) rows.push(['Account', `${leg.accountName} · ${leg.accountNumber}`]);
    const fx = (tx.metadata as { fx?: { rate: string; from: string; to: string } }).fx;
    if (fx) rows.push(['Exchange rate', `1 ${fx.from} = ${fx.rate} ${fx.to}`]);
    const x = 40;
    const w = doc.page.width - 80;
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(GREY).text(k, x, y, { width: w * 0.4 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(v, x + w * 0.4, y, { width: w * 0.6, align: 'right' });
      doc.moveDown(0.6);
      doc.moveTo(x, doc.y).lineTo(x + w, doc.y).strokeColor('#ECE7DA').lineWidth(0.5).stroke();
      doc.moveDown(0.6);
    }
    this.footer(doc);
    return toBuffer(doc);
  }

  async statement(userId: string, accountId: string, from: Date, to: Date): Promise<{ pdf: Buffer; filename: string; period: string; accountNumber: string }> {
    const account = await this.prisma.ledgerAccount.findFirst({ where: { id: accountId, ownerId: userId }, include: { owner: true } });
    if (!account || !account.owner) throw notFound('Account');
    const end = new Date(to.getTime() + 86_399_999);
    if (end < from) throw new AppError('VALIDATION', 'End date must be after start date.');
    if (end.getTime() - from.getTime() > 366 * 86_400_000) throw new AppError('VALIDATION', 'Statements can cover at most one year.');
    // Use value date so admin back-dated entries land in the right period.
    const postings = await this.prisma.posting.findMany({
      where: { accountId, entry: { valueDate: { gte: from, lte: end } } },
      include: { entry: true },
      orderBy: [{ entry: { valueDate: 'asc' } }, { createdAt: 'asc' }],
    });
    const before = await this.prisma.posting.aggregate({ where: { accountId, entry: { valueDate: { lt: from } } }, _sum: { amount: true } });
    const opening = new Decimal(before._sum.amount?.toString() ?? 0);
    let credits = new Decimal(0);
    let debits = new Decimal(0);
    for (const p of postings) {
      const a = new Decimal(p.amount.toString());
      if (a.isPositive()) credits = credits.plus(a);
      else debits = debits.plus(a.abs());
    }
    const closing = opening.plus(credits).minus(debits);
    const cur = account.currency;
    const period = `${fmtDay(from)} – ${fmtDay(to)}`;

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    this.header(doc, 'Account statement');
    const u = account.owner;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(`${u.firstName} ${u.lastName}`, 50, 115);
    doc.font('Helvetica').fontSize(9).fillColor(GREY).text([u.addressLine1, [u.city, u.state, u.postalCode].filter(Boolean).join(', '), u.country].filter(Boolean).join('\n'));
    doc.font('Helvetica').fontSize(9).fillColor(GREY).text(`Account: ${account.name}`, 330, 115, { width: 215, align: 'right' });
    doc.text(`Account number: ${account.accountNumber ?? '—'}`, { width: 215, align: 'right' });
    doc.text(`Currency: ${cur}`, { width: 215, align: 'right' });
    doc.text(`Period: ${period}`, { width: 215, align: 'right' });
    doc.text(`Generated: ${fmtDate(new Date())}`, { width: 215, align: 'right' });

    // Summary boxes
    const boxY = 205;
    const boxes: [string, string][] = [
      ['Opening balance', formatMoney(opening, cur)],
      ['Money in', formatMoney(credits, cur)],
      ['Money out', formatMoney(debits, cur)],
      ['Closing balance', formatMoney(closing, cur)],
    ];
    const bw = (doc.page.width - 100 - 30) / 4;
    boxes.forEach(([k, v], i) => {
      const bx = 50 + i * (bw + 10);
      doc.roundedRect(bx, boxY, bw, 50, 6).fill(i === 3 ? NAVY : '#F7F5EF');
      doc.font('Helvetica').fontSize(8).fillColor(i === 3 ? GOLD : GREY).text(k, bx + 10, boxY + 10, { width: bw - 20 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(i === 3 ? '#FFFFFF' : NAVY).text(v, bx + 10, boxY + 25, { width: bw - 20 });
    });

    const cols = [
      { k: 'Date', w: 70 },
      { k: 'Description', w: 185 },
      { k: 'Reference', w: 85 },
      { k: 'Amount', w: 75, right: true },
      { k: 'Balance', w: 80, right: true },
    ];
    const drawHead = (y: number) => {
      doc.rect(50, y, doc.page.width - 100, 20).fill(NAVY);
      let cx = 55;
      cols.forEach((c) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(c.k, cx, y + 6, { width: c.w - 8, align: c.right ? 'right' : 'left' });
        cx += c.w;
      });
      return y + 24;
    };
    let y = drawHead(275);
    let running = opening;
    const line = (vals: string[], shade: boolean, color?: string) => {
      if (y > doc.page.height - 90) {
        doc.addPage();
        y = drawHead(50);
      }
      if (shade) doc.rect(50, y - 3, doc.page.width - 100, 18).fill('#FAFAF7');
      let cx = 55;
      vals.forEach((v, i) => {
        doc.font('Helvetica').fontSize(8).fillColor(i === 3 && color ? color : NAVY).text(v, cx, y, { width: cols[i].w - 8, align: cols[i].right ? 'right' : 'left', lineBreak: false, ellipsis: true });
        cx += cols[i].w;
      });
      y += 18;
    };
    line([fmtDay(from), 'Opening balance', '', '', formatMoney(opening, cur)], false);
    postings.forEach((p, i) => {
      const a = new Decimal(p.amount.toString());
      running = running.plus(a);
      line([fmtDay(p.entry.valueDate), p.entry.description, p.entry.reference, formatMoney(a, cur, { sign: true }), formatMoney(running, cur)], i % 2 === 0, a.isNegative() ? '#B42318' : '#0E7A4F');
    });
    if (!postings.length) line(['', 'No transactions in this period', '', '', ''], false);
    line([fmtDay(to), 'Closing balance', '', '', formatMoney(closing, cur)], false);

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      this.footer(doc);
      doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`Page ${i + 1} of ${pages.count}`, 50, doc.page.height - 45, { align: 'center', width: doc.page.width - 100 });
    }
    const pdf = await toBuffer(doc);
    const stamp = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
    return { pdf, filename: `OneBank-statement-${account.accountNumber ?? account.id}-${stamp}.pdf`, period, accountNumber: account.accountNumber ?? '' };
  }
}
