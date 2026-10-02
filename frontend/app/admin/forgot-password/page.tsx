"use client"

import { useState } from "react"
import Link from "next/link"
import { adminApi, passwordProblem } from "@/lib/admin-api"
import {
  AuthCard, CodeField, ErrorText, Field, Notice, PrimaryButton, TextButton, errorMessage,
} from "@/components/auth-ui"

export default function AdminForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await adminApi.forgotPassword(email.trim())
      setInfo(res.message)
      setStep("reset")
    } catch (err) {
      setError(errorMessage(err, "Could not send a reset code. Try again."))
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError("The two passwords don't match.")
    setError(null)
    setLoading(true)
    try {
      await adminApi.resetPassword(email.trim(), code, password)
      setStep("done")
    } catch (err) {
      setError(errorMessage(err, "Could not reset the password. Try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Reset admin password" subtitle="We'll email a 6-digit code to your admin address.">
      {step === "email" && (
        <form onSubmit={handleRequest} className="space-y-4">
          <Field id="email" label="Admin email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Sending...">Send reset code</PrimaryButton>
        </form>
      )}

      {step === "reset" && (
        <form onSubmit={handleReset} className="space-y-4">
          {info && <Notice>{info} The code expires in 15 minutes.</Notice>}
          <CodeField value={code} onChange={setCode} />
          <Field id="new-password" label="New password" type="password" autoComplete="new-password" required
            hint="At least 10 characters, with letters and numbers."
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <Field id="confirm-password" label="Confirm new password" type="password" autoComplete="new-password"
            required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Saving...">Set new password</PrimaryButton>
          <TextButton onClick={() => { setStep("email"); setError(null) }}>Send a new code</TextButton>
        </form>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <Notice tone="success">Password changed. Every earlier reset code for this account has been cancelled.</Notice>
          <Link href="/login?as=admin" className="block text-center bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2.5">
            Log in as admin
          </Link>
        </div>
      )}

      {step !== "done" && (
        <p className="mt-6 text-center text-[12px] text-[#57534E]">
          No access to your admin email? Ask a super admin to deactivate this account and create a new one for you.
        </p>
      )}
    </AuthCard>
  )
}
