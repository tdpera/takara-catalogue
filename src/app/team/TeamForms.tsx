"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import type { Role } from "@/lib/session";
import { btn, btnLink, btnPrimary, errorText, hint, input, label } from "@/components/ui";
import { cancelInvite, inviteMember, removeMember, setRole, updateMyName, type ActionResult } from "./actions";

export function NameForm({ initial }: { initial: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateMyName, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <label htmlFor="my-name" className={label}>{t("team.yourName")}</label>
        <input id="my-name" name="name" defaultValue={initial} maxLength={40} className={input} autoComplete="name" aria-describedby="my-name-hint" />
        <p id="my-name-hint" className={hint}>{t("team.yourNameHint")}</p>
      </div>
      <button className={btn + " mb-7"} disabled={pending}>{t("common.save")}</button>
      {state?.error && <p role="alert" className={errorText + " w-full"}>{t(state.error)}</p>}
    </form>
  );
}

export function InviteForm({ roles }: { roles: Role[] }) {
  const { t } = useT();
  const [state, action, pending] = useActionState<ActionResult, FormData>(inviteMember, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="mt-3 space-y-4" noValidate>
      <div>
        <label htmlFor="invite-phone" className={label}>{t("team.invitePhone")}</label>
        <input id="invite-phone" name="phone" dir="ltr" type="tel" inputMode="tel" placeholder="050 123 4567" className={input + " text-start"} required />
      </div>
      <fieldset>
        <legend className={label}>{t("team.inviteRole")}</legend>
        <div className="space-y-2">
          {roles.map((r, i) => (
            <label key={r} className="flex min-h-11 items-start gap-3 rounded-xl border border-line p-3">
              <input type="radio" name="role" value={r} defaultChecked={i === 0} className="mt-1 size-4" />
              <span>
                <span className="block font-medium">{t(`roles.${r}`)}</span>
                <span className="block text-sm text-muted">{t(`roles.${r}Help` as MessageKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={hint}>{t("team.inviteHelp")}</p>
      {state?.error && <p role="alert" className={errorText}>{t(state.error)}</p>}
      <button className={btnPrimary} disabled={pending}>{t("team.sendInvite")}</button>
    </form>
  );
}

export function PendingInvite({ id, phone, display, role, canCancel, message }: { id: string; phone: string; display: string; role: Role; canCancel: boolean; message: string }) {
  const { t } = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<MessageKey | null>(null);
  const wa = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <p className="me-auto">
        <span dir="ltr" className="num">{display}</span>
        <span className="text-muted"> · {t(`roles.${role}`)}</span>
      </p>
      <a className={btnLink} href={wa} target="_blank" rel="noopener noreferrer">{t("team.tellWhatsApp")}</a>
      {canCancel && (
        <button
          className={btn}
          disabled={pending}
          onClick={() => start(async () => setError((await cancelInvite(id))?.error ?? null))}
        >
          {t("common.cancel")}
        </button>
      )}
      {error && <p role="alert" className={errorText + " w-full"}>{t(error)}</p>}
    </li>
  );
}

export function MemberActions(props: {
  userId: string;
  name: string;
  shopName: string;
  role: Role;
  self: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
}) {
  const { t } = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<MessageKey | null>(null);
  const [role, setRoleValue] = useState<Role>(props.role);
  const run = (fn: () => Promise<ActionResult>, onError?: () => void) =>
    start(async () => {
      const err = (await fn())?.error ?? null;
      setError(err);
      if (err) onError?.();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.canChangeRole && (
        <select
          aria-label={`${t("team.inviteRole")}: ${props.name}`}
          className="min-h-11 rounded-xl border border-line bg-surface px-2"
          value={role}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as Role;
            setRoleValue(next);
            run(() => setRole(props.userId, next), () => setRoleValue(props.role));
          }}
        >
          {(["owner", "manager", "salesperson"] as Role[]).map((r) => (
            <option key={r} value={r}>{t(`roles.${r}`)}</option>
          ))}
        </select>
      )}
      {props.canRemove && (
        <button
          className={btn}
          disabled={pending}
          onClick={() => {
            const q = props.self ? t("team.confirmLeave", { shop: props.shopName }) : t("team.confirmRemove", { name: props.name });
            if (window.confirm(q)) run(() => removeMember(props.userId));
          }}
        >
          {props.self ? t("team.leave") : t("team.remove")}
        </button>
      )}
      {error && <p role="alert" className={errorText + " w-full"}>{t(error)}</p>}
    </div>
  );
}
