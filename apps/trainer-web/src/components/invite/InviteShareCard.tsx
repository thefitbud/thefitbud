import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatPersonName, whatsappHref } from "@fitbud/core";
import { Check, Link2, Mail, QrCode } from "lucide-react";
import { Button } from "../Button";

type Props = {
  name: string;
  inviteUrl: string;
  whatsappE164: string | null;
  /** Full trainer display name for "Signed as you, …". */
  trainerDisplayName?: string;
  /** @deprecated Prefer trainerDisplayName. Kept for embedded callers. */
  trainerFirstName?: string;
  onInviteAnother: () => void;
  onEmailInvite?: () => void;
};

function firstNameOf(raw: string): string {
  const formatted = formatPersonName(raw);
  return formatted.split(/\s+/)[0] || formatted || "there";
}

function WhatsAppGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.47 14.38c-.28-.14-1.64-.81-1.9-.9-.25-.1-.44-.14-.62.14-.18.27-.71.9-.87 1.08-.16.18-.32.2-.6.07-.28-.14-1.17-.43-2.23-1.37-.82-.73-1.38-1.64-1.54-1.92-.16-.27-.02-.42.12-.55.13-.13.28-.32.42-.48.14-.16.18-.27.28-.45.09-.18.05-.34-.02-.48-.07-.14-.62-1.49-.85-2.04-.22-.53-.45-.46-.62-.47h-.53c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.3s.99 2.67 1.12 2.85c.14.18 1.95 2.98 4.72 4.18.66.29 1.18.46 1.58.59.66.21 1.27.18 1.75.11.53-.08 1.64-.67 1.87-1.32.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.53-.32z" />
      <path d="M12.04 2C6.5 2 2.02 6.48 2.02 12c0 1.77.46 3.45 1.28 4.92L2 22l5.25-1.27A9.96 9.96 0 0 0 12.04 22C17.56 22 22 17.52 22 12S17.56 2 12.04 2zm0 18.13c-1.6 0-3.14-.43-4.47-1.2l-.32-.19-3.12.75.75-3.04-.2-.33a8.1 8.1 0 0 1-1.24-4.32c0-4.48 3.65-8.13 8.14-8.13 4.48 0 8.13 3.65 8.13 8.13 0 4.49-3.65 8.13-8.13 8.13z" />
    </svg>
  );
}

export function InviteShareCard({
  name,
  inviteUrl,
  whatsappE164,
  trainerDisplayName,
  trainerFirstName = "I",
  onInviteAnother,
  onEmailInvite,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const shortName = firstNameOf(name);
  const signedAs =
    formatPersonName(trainerDisplayName) ||
    formatPersonName(trainerFirstName) ||
    "you";
  const draft = `Hi ${shortName}, I've set up your coaching on FitBud. Join here: ${inviteUrl}`;
  const waLink = whatsappE164
    ? whatsappHref({ phoneE164: whatsappE164, draftText: draft })
    : null;

  useEffect(() => {
    void QRCode.toDataURL(inviteUrl, { width: 180, margin: 1 }).then(
      setQrDataUrl,
    );
  }, [inviteUrl]);

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      const ta = document.createElement("textarea");
      ta.value = inviteUrl;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="invite-share-card" data-testid="invite-share-card">
      <div className="invite-share-head">
        <span className="invite-share-check" aria-hidden>
          <Check size={14} strokeWidth={2.5} />
        </span>
        <div>
          <h2>Invite ready for {shortName}</h2>
          <p className="invite-share-lede">
            Send it from your WhatsApp. You can edit the message before you
            press Send.
          </p>
        </div>
      </div>

      <div className="invite-share-preview">
        <p>{draft}</p>
        <p className="invite-share-signed">Signed as you, {signedAs}</p>
      </div>

      <div className="invite-share-actions">
        {waLink ? (
          <a
            className="button-primary btn-lg"
            href={waLink}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsAppGlyph />
            Send on WhatsApp
          </a>
        ) : null}
        <Button
          variant="secondary"
          className="btn-lg"
          onClick={() => void copyLink()}
        >
          <Link2 size={16} strokeWidth={1.75} aria-hidden />
          {copied ? "Copied" : "Copy invite link"}
        </Button>
        {onEmailInvite ? (
          <Button variant="secondary" className="btn-lg" onClick={onEmailInvite}>
            <Mail size={16} strokeWidth={1.75} aria-hidden />
            Email invite
          </Button>
        ) : null}
        <Button
          variant="secondary"
          className="btn-lg invite-share-qr"
          onClick={() => setShowQr((v) => !v)}
        >
          <QrCode size={16} strokeWidth={1.75} aria-hidden />
          {showQr ? "Hide QR code" : "QR code"}
        </Button>
      </div>

      {showQr && qrDataUrl ? (
        <div className="invite-qr">
          <img src={qrDataUrl} width={180} height={180} alt="Invite QR code" />
          <span className="muted">Scan to open the invite link</span>
        </div>
      ) : null}

      <p className="invite-share-note">
        This link works once and expires in 14 days. Your client will set a
        password when they join.
      </p>

      <p className="auth-alt-links">
        <button type="button" className="link" onClick={onInviteAnother}>
          Invite another client
        </button>
      </p>
    </div>
  );
}
