/**
 * mailer.js — Transactional email via nodemailer
 *
 * Configure via env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   (generic SMTP)
 *   EMAIL_FROM  (defaults to SMTP_USER)
 *
 * If SMTP_HOST is unset, mailer is disabled and sendMail returns null
 * silently — prevents crashes in environments without email config.
 */
const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    logger.warn({ to, subject }, 'SMTP not configured — email not sent');
    return null;
  }
  try {
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
    });
    logger.info({ messageId: info.messageId, to }, 'Email sent');
    return info;
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
    throw err;
  }
}

module.exports = { sendMail };
