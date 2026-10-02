"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import {
  AuthCard, CodeField, ErrorText, Field, Notice, PrimaryButton, Segmented, TextButton,
  contactLabel, errorMessage, parseContact,
} from "@/components/auth-ui"

export default function RegisterPage() {
  const router = useRouter()
  const { requestOtp, verifyOtp } = useAuth()

  const [step, setStep] = useState<"details" | "code">("details")
  const [contactInput, setContactInput] = useState("")
  const [fullName, setFullName] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const contact = parseContact(contactInput)

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!contact) {
      setError("Enter a valid email address or 10-digit mobile number.")
      return
    }
    setError(null)
    setLoading(true)
    try {
      await requestOtp({ ...contact, mode: "register" })
      setCode("")
      setStep("code")
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Try again."))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!contact) return
    setError(null)
    setLoading(true)
    try {
      await verifyOtp({ ...contact, code, full_name: fullName })
      // Straight to account settings so they can add a backup contact —
      // the only self-service way back in if they lose this one.
      router.push("/account?welcome=1")
    } catch (err) {
      setError(errorMessage(err, "Invalid code. Try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Create an account" subtitle="Citizens sign up with an email or mobile number — no password needed.">
      <Segmented
        label="New or existing citizen"
        value="new"
        onChange={(v) => v === "existing" && router.push("/login")}
        options={[
          { value: "existing", label: "I have an account" },
          { value: "new", label: "I'm new" },
        ]}
      />

      {step === "details" && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <Field
            id="fullName"
            label="Full name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
          <Field
            id="contact"
            label="Email or mobile number"
            type="text"
            autoComplete="username"
            required
            value={contactInput}
            onChange={(e) => setContactInput(e.target.value)}
            placeholder="you@example.com or 98765 43210"
          />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Sending...">Send code</PrimaryButton>
        </form>
      )}

      {step === "code" && contact && (
        <form onSubmit={handleVerify} className="space-y-4">
          <p className="text-[13px] text-[#57534E]">We sent a 6-digit code to {contactLabel(contact)}.</p>
          <CodeField value={code} onChange={setCode} />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Verifying...">Create account</PrimaryButton>
          <TextButton onClick={() => { setStep("details"); setError(null) }}>Edit details</TextButton>
        </form>
      )}

      <div className="mt-6">
        <Notice>
          Admins don&apos;t sign up here — admin accounts are created by a super admin.{" "}
          <Link href="/login?as=admin" className="underline font-medium">Admin log in</Link>
        </Notice>
      </div>
    </AuthCard>
  )
}
