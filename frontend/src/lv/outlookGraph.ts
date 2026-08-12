import { PublicClientApplication, type AuthenticationResult } from "@azure/msal-browser";

// ─────────────────────────────────────────────────────────────────────────────
// Outlook (Microsoft 365) integration — create a DRAFT e-mail in the signed-in
// user's mailbox with the two offer PDFs already attached, then open it to send.
//
// Configuration (Vite env, set in .env and in Vercel):
//   VITE_MSAL_CLIENT_ID   the Azure AD app registration's Application (client) ID
//   VITE_MSAL_TENANT      tenant id, or "organizations"/"common" (default below)
// The Azure app must register THIS app's origin(s) as SPA redirect URIs
// (http://localhost:5173 for dev, the deployed URL for prod) and be granted the
// delegated Microsoft Graph permission "Mail.ReadWrite". Without a client ID the
// feature is OFF (graphConfigured() === false) and the caller falls back to mailto.
// ─────────────────────────────────────────────────────────────────────────────

const env = import.meta.env as unknown as Record<string, string | undefined>;
const CLIENT_ID = env.VITE_MSAL_CLIENT_ID;
const TENANT = env.VITE_MSAL_TENANT || "organizations";
const SCOPES = ["Mail.ReadWrite"];

export function graphConfigured(): boolean {
  return !!CLIENT_ID;
}

let pca: PublicClientApplication | null = null;
async function client(): Promise<PublicClientApplication> {
  if (!CLIENT_ID) throw new Error("Outlook (Microsoft 365) is not configured — set VITE_MSAL_CLIENT_ID.");
  if (!pca) {
    pca = new PublicClientApplication({
      auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT}`, redirectUri: window.location.origin },
      cache: { cacheLocation: "localStorage" },
    });
    await pca.initialize();
  }
  return pca;
}

async function token(): Promise<string> {
  const app = await client();
  const account = app.getAllAccounts()[0];
  let res: AuthenticationResult;
  try {
    res = account
      ? await app.acquireTokenSilent({ scopes: SCOPES, account })
      : await app.loginPopup({ scopes: SCOPES });
  } catch {
    // silent acquisition failed (consent needed / expired) → interactive sign-in
    res = await app.loginPopup({ scopes: SCOPES });
  }
  return res.accessToken;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read a PDF for attaching."));
    r.readAsDataURL(blob);
  });
}

export type MailAttachment = { name: string; blob: Blob };

/**
 * Create a DRAFT e-mail in the signed-in user's Outlook with the given recipient,
 * subject, body and PDF attachments, and return the draft's webLink (opens it in
 * Outlook on the web to review and send). Attachments are sent inline (base64) —
 * fine for the small offer PDFs; a combined size over ~3 MB would need an upload
 * session, which this does not implement.
 */
export async function createOutlookDraft(opts: {
  to: string; subject: string; body: string; attachments: MailAttachment[];
}): Promise<string> {
  const accessToken = await token();
  const attachments = await Promise.all(
    opts.attachments.map(async (a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name.toLowerCase().endsWith(".pdf") ? a.name : `${a.name}.pdf`,
      contentType: "application/pdf",
      contentBytes: await blobToBase64(a.blob),
    })),
  );
  const res = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: opts.subject,
      body: { contentType: "Text", content: opts.body },
      toRecipients: opts.to ? [{ emailAddress: { address: opts.to } }] : [],
      attachments,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Outlook draft failed (${res.status}). ${txt.slice(0, 200)}`);
  }
  const msg = (await res.json()) as { webLink?: string };
  return msg.webLink || "";
}
