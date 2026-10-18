import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { whatsappHref } from "@fitbud/core";
import { Button } from "../Button";

type Props = {
  name: string;
  inviteUrl: string;
  whatsappE164: string | null;
  trainerFirstName?: string;
  onInviteAnother: () => void;
  onEmailInvite?: () => void;
};

export function InviteShareCard({
  name,
  inviteUrl,
  whatsappE164,
  trainerFirstName = "I",
  onInviteAnother,
  onEmailInvite,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const draft = `${trainerFirstName} invited you to coaching on FitBud. Join here: ${inviteUrl}`;
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
      <h2>Invite ready for {name}</h2>
      <p className="muted">
        This link works once and expires in 14 days. Your client will set a
        password when they join.
      </p>
      <div className="invite-share-actions">
        {waLink ? (
          <a
            className="button-primary btn-lg btn-block"
            href={waLink}
            target="_blank"
            rel="noreferrer"
          >
            Send on WhatsApp
          </a>
        ) : null}
        <Button variant="secondary" className="btn-block" onClick={() => void copyLink()}>
          {copied ? "Copied" : "Copy invite link"}
        </Button>
        {onEmailInvite ? (
          <Button variant="secondary" className="btn-block" onClick={onEmailInvite}>
            Email invite
          </Button>
        ) : null}
        <Button
          variant="secondary"
          className="btn-block"
          onClick={() => setShowQr((v) => !v)}
        >
          {showQr ? "Hide QR code" : "QR code"}
        </Button>
      </div>
      {showQr && qrDataUrl ? (
        <div className="invite-qr">
          <img src={qrDataUrl} width={180} height={180} alt="Invite QR code" />
          <span className="muted">Scan to open the invite link</span>
        </div>
      ) : null}
      <p className="auth-alt-links">
        <button type="button" className="link" onClick={onInviteAnother}>
          Invite another client
        </button>
      </p>
    </div>
  );
}
