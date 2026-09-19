/**
 * Minimal SMTP fallback provider — implemented directly on node:net/node:tls so
 * the project stays dependency-free. Supports:
 *   - implicit TLS (SMTP_PORT=465)
 *   - STARTTLS (SMTP_PORT=587, the common case)
 *   - AUTH LOGIN and AUTH PLAIN
 *
 * Env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM
 */

import net from "node:net";
import tls from "node:tls";
import type { OutboundMail, SendResult } from "./resend";

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

interface SmtpConn {
  socket: net.Socket | tls.TLSSocket;
  buf: string;
  waiters: (() => void)[];
}

function readResponse(conn: SmtpConn, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      // A full SMTP reply ends with "<code> <text>\r\n" (single line, space).
      const lines = conn.buf.split("\r\n").filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      if (/^\d{3} /.test(last)) {
        const out = conn.buf;
        conn.buf = "";
        resolve(out);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("SMTP timeout"));
        return;
      }
      conn.waiters.push(tick);
    };
    tick();
  });
}

function attach(conn: SmtpConn) {
  conn.socket.setEncoding("utf8");
  conn.socket.on("data", (chunk: string) => {
    conn.buf += chunk;
    const waiting = conn.waiters.splice(0, conn.waiters.length);
    for (const w of waiting) w();
  });
}

function command(conn: SmtpConn, line: string, timeoutMs = 12_000): Promise<string> {
  conn.socket.write(`${line}\r\n`);
  return readResponse(conn, timeoutMs);
}

function expectCode(reply: string, codes: number[]): void {
  const code = Number(reply.slice(0, 3));
  if (!codes.includes(code)) {
    throw new Error(`SMTP error ${code}: ${reply.slice(0, 160)}`);
  }
}

/** RFC 5321 dot-stuffing so a body line of "." cannot end the DATA block. */
function dotStuff(body: string): string {
  return body
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function parseFrom(): { header: string } {
  return { header: process.env.MAIL_FROM ?? "ZenFrame <hello@zenframe.in>" };
}

function addressOf(header: string): string {
  const m = /<([^>]+)>/.exec(header);
  return m ? m[1] : header.trim();
}

export async function sendViaSmtp(mail: OutboundMail): Promise<SendResult> {
  if (!smtpConfigured()) {
    return { ok: false, provider: "smtp", detail: "SMTP not configured" };
  }
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;

  let socket: net.Socket | tls.TLSSocket;
  try {
    socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        socket.off("error", onErr);
        resolve();
      };
      const onErr = (e: Error) => {
        socket.off("secureConnect", onReady);
        socket.off("connect", onReady);
        reject(e);
      };
      socket.once(secure ? "secureConnect" : "connect", onReady);
      socket.once("error", onErr);
      socket.setTimeout(15_000, () => onErr(new Error("SMTP connection timeout")));
    });
  } catch (err) {
    return {
      ok: false,
      provider: "smtp",
      detail: err instanceof Error ? err.message.slice(0, 200) : "connect failed",
    };
  }

  const conn: SmtpConn = { socket, buf: "", waiters: [] };
  attach(conn);

  try {
    expectCode(await readResponse(conn, 15_000), [220]);
    const ehlo = await command(conn, `EHLO ${host}`);

    if (!secure && /STARTTLS/i.test(ehlo)) {
      expectCode(await command(conn, "STARTTLS"), [220]);
      const upgraded = tls.connect({ socket, servername: host });
      await new Promise<void>((resolve, reject) => {
        upgraded.once("secureConnect", () => resolve());
        upgraded.once("error", (e) => reject(e));
      });
      conn.socket = upgraded;
      conn.buf = "";
      conn.waiters = [];
      attach(conn);
      await command(conn, `EHLO ${host}`);
    }

    if (user && pass) {
      const supportsPlain = /AUTH[^\n]*PLAIN/i.test(ehlo);
      if (supportsPlain) {
        const token = Buffer.from(`\0${user}\0${pass}`).toString("base64");
        expectCode(await command(conn, `AUTH PLAIN ${token}`), [235]);
      } else {
        expectCode(await command(conn, "AUTH LOGIN"), [334]);
        expectCode(await command(conn, Buffer.from(user).toString("base64")), [334]);
        expectCode(await command(conn, Buffer.from(pass).toString("base64")), [235]);
      }
    }

    const from = parseFrom().header;
    expectCode(await command(conn, `MAIL FROM:<${addressOf(from)}>`), [250]);
    expectCode(await command(conn, `RCPT TO:<${mail.to}>`), [250, 251]);
    expectCode(await command(conn, "DATA"), [354]);

    const message = [
      `From: ${from}`,
      `To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="utf-8"',
      "Date: " + new Date().toUTCString(),
      "",
      mail.html,
    ].join("\r\n");

    conn.socket.write(`${dotStuff(message)}\r\n.\r\n`);
    expectCode(await readResponse(conn, 20_000), [250]);
    await command(conn, "QUIT", 4000).catch(() => "");
    return { ok: true, provider: "smtp" };
  } catch (err) {
    return {
      ok: false,
      provider: "smtp",
      detail: err instanceof Error ? err.message.slice(0, 200) : "send failed",
    };
  } finally {
    try {
      conn.socket.end();
      conn.socket.destroy();
    } catch {
      /* already closed */
    }
  }
}
