import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return <div className="auth-card"><div className="mb-8"><p className="eyebrow">Account recovery</p><h2 className="mt-3 text-2xl font-semibold text-[#F3F5FF]">Reset your password</h2><p className="mt-2 text-sm leading-6 text-[#888]">We will send a secure recovery link if this is the owner email.</p></div><ForgotForm /></div>;
}
