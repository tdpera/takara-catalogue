import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { AuthShell } from "@/components/AuthShell";
import { getT } from "@/i18n/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");
  const { t } = await getT();
  return (
    <AuthShell>
      <h1 className="font-display text-[1.7rem] leading-tight">{t("login.title")}</h1>
      <p className="mt-1 text-muted">{t("login.subtitle")}</p>
      <LoginForm />
    </AuthShell>
  );
}
