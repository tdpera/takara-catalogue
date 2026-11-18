import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { LanguagePicker } from "@/components/LanguagePicker";
import { getT } from "@/i18n/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");
  const { t } = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-2xl">{t("app.name")}</p>
        <LanguagePicker />
      </div>
      <div className="mt-10">
        <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
        <p className="mt-1 text-muted">{t("login.subtitle")}</p>
        <LoginForm />
      </div>
    </main>
  );
}
