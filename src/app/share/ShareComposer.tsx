"use client";
/**
 * Share composer: pieces → optional client → message → outputs (link, WhatsApp, image).
 * Nothing is ever sent from here: the salesperson copies the link, saves the image or taps
 * "Send on WhatsApp", which opens WhatsApp with the text filled in for them to send.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { LOCALE_NAMES, type MessageKey } from "@/i18n";
import type { ClientRow, ShareItem } from "@/lib/share-data";
import { buildMessage, ENGLISH_CLOSING, englishIntro, noPriceText, priceNote, whatsappLink, withLink, type MsgLang } from "@/lib/share-message";
import { IMAGE_MAX, renderCatalogueImage, shareOrDownload } from "@/lib/share-image";
import { formatDubaiDateTime } from "@/lib/format";
import { btn, btnLink, btnPrimary, errorText, hint, input, label } from "@/components/ui";
import { createShare, saveClient, writeWithAi } from "./actions";
import { IconChat, IconImage, IconSparkles, IconTray, IconX } from "@/components/icons";
import { EmptyState } from "@/components/EmptyState";

const ERR: Record<string, MessageKey> = {
  rate_limited: "ai.err_rate_limited",
  quota: "ai.err_quota",
  refused: "ai.err_refused",
  invalid_output: "share.aiInvalid",
  busy: "ai.err_busy",
  timeout: "ai.err_timeout",
  not_configured: "ai.err_not_configured",
  auth: "ai.err_auth",
};

type Created = { url: string; expiresAt: string };

export function ClientForm({
  shopId,
  initial,
  onSaved,
  onCancel,
}: {
  shopId: string;
  initial?: ClientRow | null;
  onSaved: (c: ClientRow) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [lang, setLang] = useState<MsgLang>(initial?.language ?? "en");
  const [prefs, setPrefs] = useState(initial?.preferences ?? "");
  const [err, setErr] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const id = initial?.id ?? "new";
  return (
    <div className="space-y-3 rounded-xl border border-line bg-paper p-3">
      <div>
        <label htmlFor={`c-name-${id}`} className={label}>{t("clients.name")}</label>
        <input id={`c-name-${id}`} className={input} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label htmlFor={`c-phone-${id}`} className={label}>{t("clients.phone")}</label>
        <input id={`c-phone-${id}`} dir="ltr" type="tel" inputMode="tel" className={input + " text-start"} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label htmlFor={`c-lang-${id}`} className={label}>{t("clients.language")}</label>
        <select id={`c-lang-${id}`} className={input} value={lang} onChange={(e) => setLang(e.target.value as MsgLang)}>
          {(["en", "ar", "hi", "ml"] as const).map((l) => (
            <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`c-prefs-${id}`} className={label}>{t("clients.preferences")}</label>
        <textarea id={`c-prefs-${id}`} rows={2} maxLength={1000} className={input + " py-2"} value={prefs} onChange={(e) => setPrefs(e.target.value)} aria-describedby={`c-prefs-hint-${id}`} />
        <p id={`c-prefs-hint-${id}`} className={hint}>{t("clients.preferencesHint")}</p>
      </div>
      {err && <p role="alert" className={errorText}>{t(err)}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await saveClient({ id: initial?.id ?? null, shopId, name, phone, language: lang, preferences: prefs });
              if (r.ok) onSaved(r.client);
              else setErr(r.error === "phone" ? "clients.phoneInvalid" : "share.failed");
            })
          }
        >
          {t("clients.save")}
        </button>
        <button type="button" className={btn} onClick={onCancel}>{t("clients.cancel")}</button>
      </div>
    </div>
  );
}

/** Step number beside each section title (decorative; the titles carry the meaning). */
function Step({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="num inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-paper">
      {n}
    </span>
  );
}

export function ShareComposer(props: { shopId: string; shopName: string; vat: boolean; items: ShareItem[]; clients: ClientRow[]; soldLeftOut: number }) {
  const { t, locale } = useT();
  const [items, setItems] = useState(props.items);
  const [clients, setClients] = useState(props.clients);
  const [clientId, setClientId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const client = clients.find((c) => c.id === clientId) ?? null;
  const lang: MsgLang = client?.language ?? "en";

  const template = useMemo(
    () => buildMessage({ intro: englishIntro(client?.name, items.length), closing: ENGLISH_CLOSING, lines: items, vat: props.vat, shop: props.shopName }),
    [client?.name, items, props.vat, props.shopName],
  );
  const [message, setMessage] = useState(template);
  const [source, setSource] = useState<"template" | "ai" | "edited">("template");
  const [stale, setStale] = useState(false);
  const [ai, setAi] = useState<{ busy: boolean; msg: string | null; ok?: boolean }>({ busy: false, msg: null });
  const [created, setCreated] = useState<Created | null>(null);
  const [createErr, setCreateErr] = useState<MessageKey | null>(null);
  const [creating, startCreate] = useTransition();
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [img, setImg] = useState<{ busy: boolean; msg: MessageKey | null }>({ busy: false, msg: null });
  const first = useRef(true);

  // Pieces or client changed: rebuild the standard message, unless the salesperson edited it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setCreated(null);
    if (source === "edited") setStale(true);
    else {
      setMessage(template);
      setSource("template");
      setAi({ busy: false, msg: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  async function runAi() {
    setAi({ busy: true, msg: null });
    const r = await writeWithAi({ shopId: props.shopId, pieceIds: items.map((i) => i.id), clientId });
    if (r.ok) {
      setMessage(r.message);
      setSource("ai");
      setStale(false);
      setAi({ busy: false, ok: true, msg: t("share.aiDone", { lang: LOCALE_NAMES[r.lang] }) });
    } else {
      setAi({ busy: false, msg: t(ERR[r.error] ?? "ai.err_error", { seconds: r.retryAfterS ?? 60 }) });
    }
  }

  function create() {
    setCreateErr(null);
    startCreate(async () => {
      const r = await createShare({ shopId: props.shopId, pieceIds: items.map((i) => i.id), clientId, message, aiMessage: source === "ai", days });
      if (r.ok) setCreated({ url: r.url, expiresAt: r.expiresAt });
      else setCreateErr(r.error === "auth" ? "ai.err_auth" : "share.failed");
    });
  }

  async function makeImage() {
    setImg({ busy: true, msg: null });
    try {
      const date = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang, { timeZone: "Asia/Dubai", day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" }).format(new Date());
      const blob = await renderCatalogueImage({
        shop: props.shopName,
        dateLine: date,
        note: priceNote(lang, props.vat),
        noPhoto: t("catalogue.noPhoto"),
        noPrice: noPriceText(lang),
        items: items.map((i) => ({ name: i.name, karat: i.karat, weight: i.weight, price: i.price, photo: i.photo })),
        rtl: lang === "ar",
      });
      const r = await shareOrDownload(blob, `${props.shopName.replace(/[^\p{L}\p{N}]+/gu, "-")}-catalogue.png`, props.shopName);
      setImg({ busy: false, msg: r === "downloaded" ? "share.imageSaved" : null });
    } catch {
      setImg({ busy: false, msg: "share.imageFailed" });
    }
  }

  const waText = created ? withLink(message, created.url, source === "ai" ? lang : "en") : "";

  if (items.length === 0) {
    return (
      <EmptyState title={t("share.none")} action={<Link href="/" className={btnLink}>{t("share.toCatalogue")}</Link>} />
    );
  }

  return (
    <div className="space-y-5">
      {props.soldLeftOut > 0 && <p className="rounded-xl border border-warn bg-warn-soft p-3 text-sm">{t("share.soldLeftOut", { count: props.soldLeftOut })}</p>}

      {/* 1. Pieces */}
      <section aria-labelledby="sh-pieces" className="rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
        <h2 id="sh-pieces" className="mb-2 flex items-center gap-2.5 font-semibold">
          <Step n={1} />
          {t("share.pieces", { count: items.length })}
        </h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2">
              {i.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.thumb} alt="" width={56} height={56} className="size-14 shrink-0 rounded-lg border border-line object-cover" />
              ) : (
                <div className="size-14 shrink-0 rounded-lg border border-dashed border-line" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{i.name}</p>
                <p className="flex flex-wrap gap-x-2 text-[13px] text-muted">
                  <span dir="ltr" className="num whitespace-nowrap">{i.karat}K · {i.weight}</span>
                  <span dir="ltr" className="num whitespace-nowrap text-gold">{i.price ?? "—"}</span>
                </p>
                {i.status === "reserved" && <p className="text-xs text-warn">{t("status.reserved")}</p>}
              </div>
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-paper"
                aria-label={t("share.remove", { name: i.name })}
                onClick={() => setItems((xs) => xs.filter((x) => x.id !== i.id))}
              >
                <IconX size={20} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. Client */}
      <section aria-labelledby="sh-client" className="space-y-2 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
        <h2 id="sh-client" className="flex items-center gap-2.5 font-semibold">
          <Step n={2} />
          <label htmlFor="sh-client-select">{t("share.client")}</label>
        </h2>
        <select
          id="sh-client-select"
          className={input}
          value={adding ? "__new" : clientId ?? ""}
          onChange={(e) => {
            if (e.target.value === "__new") setAdding(true);
            else {
              setAdding(false);
              setClientId(e.target.value || null);
            }
          }}
        >
          <option value="">{t("share.noClient")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__new">{t("share.newClient")}</option>
        </select>
        {adding && (
          <ClientForm
            shopId={props.shopId}
            onCancel={() => setAdding(false)}
            onSaved={(c) => {
              setClients((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
              setClientId(c.id);
              setAdding(false);
            }}
          />
        )}
        {client && <p className={hint}>{t("share.clientLang", { lang: LOCALE_NAMES[client.language] })}</p>}
      </section>

      {/* 3. Message */}
      <section aria-labelledby="sh-msg" className="space-y-2 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
        <h2 id="sh-msg" className="flex items-center gap-2.5 font-semibold">
          <Step n={3} />
          <label htmlFor="sh-message">{t("share.message")}</label>
        </h2>
        <textarea
          id="sh-message"
          rows={10}
          maxLength={4000}
          dir="auto"
          className={input + " py-2 text-sm leading-relaxed" + (source === "ai" ? " border-2 border-warn bg-warn-soft" : "")}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setSource("edited");
          }}
          aria-describedby="sh-msg-hint"
        />
        <p id="sh-msg-hint" className={hint}>{t("share.messageHint")}</p>
        {stale && <p className="rounded-lg border border-warn bg-warn-soft p-2 text-sm">{t("share.listChanged")}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={ai.busy} onClick={() => void runAi()}>
            <IconSparkles size={18} className="text-gold" /> {ai.busy ? t("share.aiWorking") : t("share.writeAi")}
          </button>
          {source !== "template" && (
            <button type="button" className={btn} onClick={() => { setMessage(template); setSource("template"); setStale(false); setAi({ busy: false, msg: null }); }}>
              {t("share.useTemplate")}
            </button>
          )}
        </div>
        <p role="status" className={`text-sm ${ai.ok ? "" : "text-danger"}`}>{ai.msg ?? ""}</p>
      </section>

      {/* 4. Outputs */}
      <section aria-labelledby="sh-send" className="space-y-3 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
        <h2 id="sh-send" className="flex items-center gap-2.5 font-semibold">
          <Step n={4} />
          {t("share.send")}
        </h2>
        {!created ? (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t("share.expiry")}</legend>
              <div className="flex gap-0.5 rounded-[2px] border border-line p-0.5">
                {([1, 7, 30] as const).map((d) => (
                  <label key={d} className="relative flex-1">
                    <input type="radio" name="sh-days" className="peer sr-only" checked={days === d} onChange={() => setDays(d)} />
                    <span className="flex min-h-10 cursor-pointer items-center justify-center rounded-[1px] px-3 text-[14px] font-medium text-muted transition-colors hover:text-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
                      {t(d === 1 ? "share.days1" : "share.daysN", { count: d })}
                    </span>
                  </label>
                ))}
              </div>
              <p className={hint}>{t("share.expiryHint")}</p>
            </fieldset>
            <button type="button" className={btnPrimary + " w-full min-h-12"} disabled={creating} onClick={create}>
              <IconTray size={18} /> {creating ? t("share.creating") : t("share.createLink")}
            </button>
          </>
        ) : (
          <div className="pop-in space-y-3">
            <p role="status" className="flex items-center gap-2 text-sm font-medium text-live">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" className="tick shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" pathLength={30} />
              </svg>
              {t("share.linkReady", { date: formatDubaiDateTime(created.expiresAt, locale) })}
            </p>
            <div className="flex gap-2">
              <label htmlFor="sh-link" className="sr-only">{t("share.link")}</label>
              <input id="sh-link" dir="ltr" readOnly className={input + " text-start text-sm"} value={created.url} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className={btn + " shrink-0"}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
              >
                {copied ? t("share.copied") : t("share.copy")}
              </button>
            </div>
            <a
              href={whatsappLink(client?.phone, waText)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1f7a4d] px-4 font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] motion-reduce:transform-none"
            >
              <IconChat size={20} /> {t("share.whatsapp")}
            </a>
            <p className={hint}>{t("share.whatsappHint")}</p>
            <a href={created.url} target="_blank" rel="noopener noreferrer" className={btnLink}>{t("share.openLink")}</a>
          </div>
        )}
        {createErr && <p role="alert" className={errorText}>{t(createErr)}</p>}

        <div className="border-t border-line pt-3">
          <button type="button" className={btn + " w-full"} disabled={img.busy} onClick={() => void makeImage()}>
            <IconImage size={18} /> {img.busy ? t("share.imageWorking") : t("share.image")}
          </button>
          {items.length > IMAGE_MAX && <p className={hint}>{t("share.imageMore", { max: IMAGE_MAX })}</p>}
          <p role="status" className="mt-1 text-sm">{img.msg ? t(img.msg) : ""}</p>
        </div>
      </section>
    </div>
  );
}
