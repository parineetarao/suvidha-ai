"use client"

import { useState } from "react"
import Link from "next/link"
import { apiPost } from "@/lib/api-client"
import { AuthCard, ErrorText, Field, Notice, PrimaryButton, errorMessage, parseContact } from "@/components/auth-ui"

export default function RecoverPage() {
  const [fullName, setFullName] = useState("")
  const [registered, setRegistered] = useState("")
  const [newContact, setNewContact] = useState("")
  const [details, setDetails] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!parseContact(registered) || !parseContact(newContact)) {
      setError("Both contacts must be a valid email address or 10-digit mobile number.")
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await apiPost<{ message: string }>("/auth/recovery-requests", {
        full_name: fullName || null,
        registered_contact: registered,
        new_contact: newContact,
        details: details || null,
      })
      setSentMessage(res.message)
    } catch (err) {
      setError(errorMessage(err, "Could not send your request. Try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Recover your account" wide subtitle="Citizen accounts have no password — you log in with a code sent to your email or mobile. Here's how to get back in if that isn't working.">
      <ol className="space-y-3 text-[13px] text-[#1A1A1A] mb-6">
        <li className="border border-[#E7E0D8] rounded-[6px] p-3">
          <div className="font-medium mb-1">1. Try your other contact</div>
          <p className="text-[#57534E]">
            If you added a backup email or mobile under <span className="font-medium">My account</span>, log in with
            that instead — the same account opens with either.{" "}
            <Link href="/login" className="text-[#1A6B3C] underline">Go to log in</Link>
          </p>
        </li>
        <li className="border border-[#E7E0D8] rounded-[6px] p-3">
          <div className="font-medium mb-1">2. Didn&apos;t get the code?</div>
          <p className="text-[#57534E]">
            Codes expire after 5 minutes and you can ask for 3 every 10 minutes. Check spam, make sure the number or
            email is typed exactly as you registered, then request a new one.
          </p>
        </li>
        <li className="border border-[#E7E0D8] rounded-[6px] p-3">
          <div className="font-medium mb-1">3. Lost access to every contact? Ask an admin</div>
          <p className="text-[#57534E]">
            Send the request below. An administrator will verify who you are (for example with your Aadhaar at a
            Common Service Centre) and move your account to a contact you can use now.
          </p>
        </li>
      </ol>

      {sentMessage ? (
        <Notice tone="success">{sentMessage}</Notice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field id="rec-name" label="Full name on the account" type="text" autoComplete="name"
            value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Field id="rec-old" label="Email or mobile you registered with" required type="text"
            hint="The one you can no longer receive codes on."
            value={registered} onChange={(e) => setRegistered(e.target.value)} />
          <Field id="rec-new" label="New email or mobile you can use now" required type="text"
            hint="Once approved, you'll log in with this."
            value={newContact} onChange={(e) => setNewContact(e.target.value)} />
          <div>
            <label htmlFor="rec-details" className="mb-1 block text-[12px] font-medium text-[#57534E]">
              Anything that helps us verify you (optional)
            </label>
            <textarea
              id="rec-details"
              rows={3}
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-2 text-[14px] text-[#1A1A1A] outline-none focus:border-[#1A6B3C]"
              placeholder="e.g. lost my old SIM; applied for PM Kisan through this account in August"
            />
          </div>
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Sending...">Send recovery request</PrimaryButton>
        </form>
      )}
    </AuthCard>
  )
}
