"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { LOCALE_NAMES } from "@/i18n";
import type { ClientRow } from "@/lib/share-data";
import { btn, btnPrimary } from "@/components/ui";
import { ClientForm } from "@/app/share/ShareComposer";
import { deleteClient } from "@/app/share/actions";
import { IconPlus } from "@/components/icons";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";

export function ClientsManager({ shopId, initial }: { shopId: string; initial: (ClientRow & { phoneDisplay?: string | null })[] }) {
  const { t } = useT();
  const [clients, setClients] = useState<(ClientRow & { phoneDisplay?: string | null })[]>(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const upsert = (c: ClientRow) => {
    setClients((cs) => [...cs.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name)));
    setEditing(null);
  };
  return (
    <div className="space-y-3">
      {editing === "new" ? (
        <ClientForm shopId={shopId} onSaved={upsert} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>
          <IconPlus size={18} className="stroke-[2.4]" /> {t("clients.add")}
        </button>
      )}
      {clients.length === 0 && editing !== "new" && <EmptyState title={t("clients.empty")} />}
      <ul className="space-y-3">
        {clients.map((c) =>
          editing === c.id ? (
            <li key={c.id}>
              <ClientForm shopId={shopId} initial={c} onSaved={upsert} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={c.id} className="space-y-2 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line/70">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size={44} />
                <p className="me-auto min-w-0 truncate font-semibold">{c.name}</p>
                <p className="rounded-[2px] border border-line px-2 py-0.5 text-sm text-muted">{LOCALE_NAMES[c.language]}</p>
              </div>
              {c.phone && (
                <p className="text-sm">
                  <span dir="ltr" className="num">{c.phoneDisplay ?? c.phone}</span>
                </p>
              )}
              {c.preferences && <p className="text-sm text-muted">{c.preferences}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" className={btn} onClick={() => setEditing(c.id)}>{t("clients.edit")}</button>
                <button
                  type="button"
                  className={btn + " text-danger"}
                  onClick={async () => {
                    if (!window.confirm(t("clients.confirmDelete", { name: c.name }))) return;
                    const r = await deleteClient(c.id);
                    if (r.ok) setClients((cs) => cs.filter((x) => x.id !== c.id));
                  }}
                >
                  {t("clients.delete")}
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
