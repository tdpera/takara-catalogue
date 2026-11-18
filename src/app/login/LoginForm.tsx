"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { btnLink, btnPrimary, errorText, hint, input, label } from "@/components/ui";
import { sendCode, verifyCode } from "./actions";

type Channel = "whatsapp" | "sms";
type Sent = { phone: string; display: string; channel: Channel };

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function send(channel: Channel) {
    setError(null);
    setBusy(true);
    try {
      const res = await sendCode(sent?.phone ?? raw, channel);
      if ("error" in res) setError(res.error);
      else setSent(res);
    } catch {
      setError("common.error");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sent) return;
    setError(null);
    setBusy(true);
    try {
      const res = await verifyCode(sent.phone, code);
      if ("error" in res) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("common.error");
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send("whatsapp");
        }}
        noValidate
      >
        <div>
          <label htmlFor="phone" className={label}>{t("login.phoneLabel")}</label>
          <input
            id="phone"
            dir="ltr"
            className={input + " text-start"}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="050 123 4567"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-describedby="phone-hint"
            aria-invalid={error === "login.invalidPhone"}
            required
          />
          <p id="phone-hint" className={hint}>{t("login.phoneHint")}</p>
        </div>
        {error && <p role="alert" className={errorText}>{t(error)}</p>}
        <button className={btnPrimary + " w-full"} disabled={busy || !raw.trim()}>{t("login.sendWhatsApp")}</button>
        <button type="button" className={btnLink} disabled={busy || !raw.trim()} onClick={() => void send("sms")}>
          {t("login.sendSms")}
        </button>
      </form>
    );
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={verify} noValidate>
      <p role="status">
        {t(sent.channel === "whatsapp" ? "login.codeSentWhatsApp" : "login.codeSentSms", { phone: "⁦" + sent.display + "⁩" })}
      </p>
      <div>
        <label htmlFor="code" className={label}>{t("login.codeLabel")}</label>
        <input
          id="code"
          dir="ltr"
          className={input + " num text-center text-2xl tracking-[0.4em]"}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-invalid={error === "login.invalidCode"}
          autoFocus
          required
        />
      </div>
      {error && <p role="alert" className={errorText}>{t(error)}</p>}
      <button className={btnPrimary + " w-full"} disabled={busy || code.length !== 6}>{t("login.verify")}</button>
      <div className="flex flex-wrap gap-x-6">
        <button type="button" className={btnLink} disabled={busy} onClick={() => void send(sent.channel)}>{t("login.resend")}</button>
        <button type="button" className={btnLink} disabled={busy} onClick={() => { setSent(null); setCode(""); setError(null); }}>
          {t("login.changeNumber")}
        </button>
      </div>
    </form>
  );
}
