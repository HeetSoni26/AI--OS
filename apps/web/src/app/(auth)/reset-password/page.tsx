import { ResetForm } from "./reset-form";

export default function ResetPasswordPage() {
  return <div className="auth-card"><div className="mb-8"><p className="eyebrow">Secure recovery</p><h2 className="mt-3 text-2xl font-semibold text-[#F3F5FF]">Choose a new password</h2><p className="mt-2 text-sm leading-6 text-[#888]">Updating the password also invalidates other active sessions.</p></div><ResetForm /></div>;
}
