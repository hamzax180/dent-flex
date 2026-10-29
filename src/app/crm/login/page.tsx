import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth/session";
import { Logo } from "@/components/site/chrome";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getStaff()) redirect("/crm");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-sm rounded-2xl border border-forest/10 bg-white p-8 shadow-sm">
        <Logo className="text-forest" />
        <h1 className="mt-6 text-lg font-semibold text-ink">Staff sign-in</h1>
        <p className="mt-1 text-sm text-muted">Dent Flex CRM. Authorised staff only; activity is audited.</p>
        <LoginForm />
      </div>
    </main>
  );
}
