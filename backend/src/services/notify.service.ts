// In-app notifications, with best-effort e-mail on top.
//
// The Notification row is the record of truth. E-mail is layered over it and MUST
// NOT be able to fail the action that triggered it: approving a quotation cannot
// 500 because an SMTP server was slow. Delivery outcome is recorded on the row
// (emailedAt / emailError) so a silent failure stays visible.
import { prisma } from "../lib/prisma";
import {
  sendMail,
  emailConfigured,
  emailShell,
  emailRows,
  emailButton,
  appUrl,
} from "./email.service";

export interface NotifyInput {
  userId: string;
  kind: string;
  title: string;
  /** One-line summary; also the e-mail's opening sentence. */
  body: string;
  /** In-app path, e.g. "/lv/qtn/abc123". Converted to an absolute URL for e-mail. */
  link: string;
  qtnId?: string;
  /** Rendered as a label/value table in the e-mail. */
  details?: [string, string][];
  /** Approval or revision comment. */
  note?: string;
  /** The site address this action arrived on, so the e-mail's link is absolute
   *  even when APP_URL was never configured. */
  origin?: string;
}

/** Create the in-app notification, then try to e-mail it. Never throws. */
export async function notify(n: NotifyInput) {
  const row = await prisma.notification.create({
    data: {
      userId: n.userId,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      qtnId: n.qtnId ?? null,
    },
  });

  try {
    const u = await prisma.user.findUnique({
      where: { id: n.userId },
      select: { email: true, notifyByEmail: true },
    });
    if (!u?.email || !u.notifyByEmail || !emailConfigured) return row;

    const href = appUrl(n.link, n.origin);
    const rows: [string, string][] = [...(n.details ?? [])];
    if (n.note) rows.push(["Comment", n.note]);

    const text = [
      n.body,
      "",
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "",
      `Open: ${href}`,
    ].join("\n");

    await sendMail({
      to: u.email,
      subject: n.title,
      text,
      html: emailShell(
        n.title,
        `<p style="margin:0 0 16px;font-size:14px;line-height:1.55">${escapeHtml(n.body)}</p>` +
          emailRows(rows) +
          emailButton(href, "Open the quotation")
      ),
    });
    await prisma.notification.update({
      where: { id: row.id },
      data: { emailedAt: new Date() },
    });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 400);
    console.error("[notify] e-mail failed:", msg);
    await prisma.notification
      .update({ where: { id: row.id }, data: { emailError: msg } })
      .catch(() => {}); // recording the failure must not itself fail the action
  }
  return row;
}

/** Fan out to several users, one notification each. Never throws. */
export async function notifyAll(userIds: string[], n: Omit<NotifyInput, "userId">) {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const userId of unique) {
    try {
      await notify({ ...n, userId });
    } catch (e) {
      console.error("[notify] failed for", userId, e);
    }
  }
}

/**
 * Everyone who should see quotations arriving for approval: admins, legacy owners,
 * and anyone individually granted the approval permission.
 *
 * `perms` is a JSON string, so this matches on substring — which is why permission
 * keys must stay distinctive (none is a prefix of another).
 */
export async function approverIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      OR: [
        { tier: "ADMIN" },
        { AND: [{ tier: null }, { role: "OWNER" }] }, // not migrated, still an owner
        { perms: { contains: "qtn.approve" } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
