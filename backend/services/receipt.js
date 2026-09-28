/**
 * Renders a paid job's receipt as a PDF. Printed in English: PDFKit's
 * built-in fonts are Latin-only (so amounts read "Rs." rather than "₹"); the
 * app shows the same receipt in the user's language.
 */

const PDFDocument = require('pdfkit');
const Category = require('../models/Category');

const rupees = (paise) =>
  `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const date = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '—';

const METHODS = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI' };

function methodLabel(payment) {
  if (payment.method === 'cash') return 'Cash (confirmed by worker)';
  const via = METHODS[payment.razorpay?.method] ?? payment.razorpay?.method;
  return via ? `Online · ${via}` : 'Online';
}

/** Resolves to a Buffer holding the PDF for a PAID `payment`. */
async function renderReceiptPdf(payment) {
  const slug = payment.snapshot?.category;
  const category = slug ? await Category.findOne({ slug }).select('names').lean() : null;
  const service = category?.names?.en ?? slug ?? 'Service';

  const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Receipt ${payment.receipt.number}` } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  const row = (label, value, { bold = false } = {}) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(label, left, y, { width: width * 0.4 });
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 9)
      .fillColor('#111827')
      .text(value ?? '—', left + width * 0.4, y, { width: width * 0.6, align: 'right' });
    doc.moveDown(0.5);
  };
  const rule = () => {
    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.6);
  };

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text('Payment receipt', left);
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('SIH Connect');
  doc.moveDown(0.8);
  row('Receipt no.', payment.receipt.number, { bold: true });
  row('Paid on', date(payment.paidAt));
  rule();

  row('Service', service);
  doc.font('Helvetica').fontSize(9).fillColor('#374151').text(payment.snapshot?.description ?? '', left, doc.y, { width });
  doc.moveDown(0.6);
  row('Completed on', date(payment.snapshot?.completedAt));
  row('Customer', payment.snapshot?.clientName);
  row('Worker', payment.snapshot?.workerName);
  rule();

  row('Amount paid', rupees(payment.amountPaise), { bold: true });
  row('Payment method', methodLabel(payment));
  if (payment.razorpay?.paymentId) row('Transaction ID', payment.razorpay.paymentId);
  row('Job ID', String(payment.job));
  rule();

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#6b7280')
    .text('This is a computer-generated receipt and needs no signature.', left, doc.y, { width, align: 'center' });

  doc.end();
  return done;
}

module.exports = { renderReceiptPdf };
