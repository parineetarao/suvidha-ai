"use client"

// Admin dashboard. What each role can do is enforced by the backend
// (api/v1/admin.py + deps.get_super_admin); this page only hides controls
// a role can't use, so the UI and the API agree:
//   viewer         — overview, users, recovery requests (read), audit log
//   scheme_editor  — same, plus the data panel for editing schemes
//   super_admin    — everything, plus approving recoveries and managing admins

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ApiError } from "@/lib/api-client"
import {
  adminApi, hasAdminToken, passwordProblem, setAdminToken, ROLE_LABELS,
  type AdminMe, type AdminRole, type AnalyticsOverview, type AuditLog, type Paginated,
  type RecoveryRequest, type UserSummary,
} from "@/lib/admin-api"
import { ErrorText, Field, Notice, errorMessage } from "@/components/auth-ui"

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "")

type Tab = "overview" | "recovery" | "users" | "audit" | "admins" | "account"

export default function AdminDashboardPage() {
  const router = useRouter()
  const [me, setMe] = useState<AdminMe | null>(null)
  const [tab, setTab] = useState<Tab>("overview")

  const signOut = useCallback(() => {
    setAdminToken(null)
    router.replace("/login?as=admin")
  }, [router])

  // Any 401/403 on a dashboard call means the session is gone (expired,
  // or the admin was deactivated) — send them back to log in.
  const guard = useCallback((err: unknown) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403) && !String(err.message).includes("super admin")) {
      signOut()
      return true
    }
    return false
  }, [signOut])

  useEffect(() => {
    if (!hasAdminToken()) {
      router.replace("/login?as=admin")
      return
    }
    adminApi.me().then(setMe).catch((err) => { if (!guard(err)) signOut() })
  }, [router, guard, signOut])

  if (!me) return <div className="min-h-screen bg-[#FAF7F2]" />

  const isSuper = me.role === "super_admin"
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "recovery", label: "Recovery requests" },
    { id: "users", label: "Citizens" },
    { id: "audit", label: "Audit log" },
    ...(isSuper ? [{ id: "admins" as Tab, label: "Admins" }] : []),
    { id: "account", label: "My account" },
  ]

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1A1A1A]">
      <header className="bg-white border-b border-[#E7E0D8]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/" className="font-semibold text-[15px]">SuvidhaAI <span className="text-[#1A6B3C]">Admin</span></Link>
          <div className="ml-auto flex items-center gap-3 text-[12px] min-w-0">
            <span className="text-[#57534E] truncate">{me.email}</span>
            <span className="bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded-full px-2 py-0.5 whitespace-nowrap">
              {ROLE_LABELS[me.role]}
            </span>
            <button onClick={signOut} className="text-[#1A6B3C] underline whitespace-nowrap">Log out</button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto" aria-label="Admin sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`text-[13px] px-3 py-2 border-b-2 whitespace-nowrap ${
                tab === t.id ? "border-[#1A6B3C] text-[#1A1A1A] font-medium" : "border-transparent text-[#57534E] hover:text-[#1A1A1A]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === "overview" && <Overview guard={guard} role={me.role} />}
        {tab === "recovery" && <Recovery guard={guard} canDecide={isSuper} />}
        {tab === "users" && <Users guard={guard} />}
        {tab === "audit" && <Audit guard={guard} />}
        {tab === "admins" && isSuper && <Admins guard={guard} me={me} />}
        {tab === "account" && <MyAccount guard={guard} />}
      </main>
    </div>
  )
}

type Guard = (err: unknown) => boolean

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#E7E0D8] rounded-[8px] p-4 sm:p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function useLoad<T>(load: () => Promise<T>, guard: Guard, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    setError(null)
    load().then(setData).catch((err) => { if (!guard(err)) setError(errorMessage(err, "Could not load this section.")) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(reload, [reload])
  return { data, error, reload }
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—")

function Pager<T>({ page, data, onPage }: { page: number; data: Paginated<T>; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(data.total / data.page_size))
  return (
    <div className="flex items-center justify-between mt-3 text-[12px] text-[#57534E]">
      <span>{data.total} total</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="underline disabled:opacity-40 disabled:no-underline">Previous</button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="underline disabled:opacity-40 disabled:no-underline">Next</button>
      </div>
    </div>
  )
}

function Overview({ guard, role }: { guard: Guard; role: AdminRole }) {
  const { data, error } = useLoad<AnalyticsOverview>(() => adminApi.overview(), guard, [])
  const pending = useLoad(() => adminApi.recoveryRequests("pending"), guard, [])
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-[#E7E0D8] rounded-[8px] p-4">
          <div className="text-[12px] text-[#57534E]">Registered citizens</div>
          <div className="text-[28px] font-semibold">{data?.users_total ?? "—"}</div>
        </div>
        <div className="bg-white border border-[#E7E0D8] rounded-[8px] p-4">
          <div className="text-[12px] text-[#57534E]">Pending recovery requests</div>
          <div className="text-[28px] font-semibold">{pending.data?.total ?? "—"}</div>
        </div>
      </div>
      <ErrorText error={error} />
      <Card title="Scheme data">
        <p className="text-[13px] text-[#57534E] mb-3">
          {role === "viewer"
            ? "Your role can view citizens, recovery requests and the audit log here."
            : "Schemes, citizens and admin records are browsable in the data panel. Log in there with the same admin email and password."}
        </p>
        <a href={`${API_ORIGIN}/admin`} target="_blank" rel="noreferrer" className="inline-block bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2">
          Open data panel ↗
        </a>
      </Card>
      {data && Object.keys(data.admin_actions_by_type).length > 0 && (
        <Card title="Admin activity by action">
          <ul className="text-[13px] divide-y divide-[#F0EBE3]">
            {Object.entries(data.admin_actions_by_type).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
              <li key={action} className="flex justify-between py-1.5"><code className="text-[12px]">{action}</code><span>{count}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function Recovery({ guard, canDecide }: { guard: Guard; canDecide: boolean }) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending")
  const { data, error, reload } = useLoad(() => adminApi.recoveryRequests(status), guard, [status])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function decide(req: RecoveryRequest, approve: boolean) {
    if (approve && !window.confirm(`Move this account from ${req.registered_contact} to ${req.new_contact}? It will be signed out everywhere.`)) return
    setBusy(req.id)
    setActionError(null)
    try {
      const note = notes[req.id] ?? ""
      await (approve ? adminApi.approveRecovery(req.id, note) : adminApi.rejectRecovery(req.id, note))
      reload()
    } catch (err) {
      if (!guard(err)) setActionError(errorMessage(err, "Could not update the request."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card
      title="Citizen account recovery"
      action={
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
          className="text-[12px] border border-[#E7E0D8] rounded-[5px] px-2 py-1 bg-white">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      }
    >
      <div className="mb-4">
        <Notice>
          Approve only after verifying the person offline (e.g. Aadhaar at a CSC). Approving replaces the lost contact
          with the new one and signs the account out on every device.
          {!canDecide && " Only a super admin can approve or reject."}
        </Notice>
      </div>
      <ErrorText error={error ?? actionError} />
      {data && data.items.length === 0 && <p className="text-[13px] text-[#57534E]">No {status} requests.</p>}
      <ul className="space-y-3">
        {data?.items.map((req) => (
          <li key={req.id} className="border border-[#E7E0D8] rounded-[6px] p-3 text-[13px]">
            <div className="flex flex-wrap justify-between gap-2 mb-1">
              <span className="font-medium">{req.full_name ?? "Name not given"}</span>
              <span className="text-[12px] text-[#78716C]">{fmt(req.created_at)}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              <div><span className="text-[#57534E]">Registered contact: </span>{req.registered_contact}</div>
              <div><span className="text-[#57534E]">New contact: </span>{req.new_contact}</div>
            </div>
            <div className="text-[12px] mt-1">
              {req.matched_user_id
                ? <span className="text-[#166534]">✓ Matches an existing account</span>
                : <span className="text-[#B45309]">No account uses the registered contact</span>}
            </div>
            {req.details && <p className="text-[12px] text-[#57534E] mt-2 whitespace-pre-wrap">{req.details}</p>}
            {req.review_note && <p className="text-[12px] mt-2"><span className="text-[#57534E]">Review note: </span>{req.review_note}</p>}
            {req.status === "pending" && canDecide && (
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  aria-label="Review note"
                  placeholder="Note (e.g. Aadhaar verified at CSC)"
                  value={notes[req.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [req.id]: e.target.value })}
                  className="flex-1 min-w-0 bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-2 py-1.5 text-[12px]"
                />
                <div className="flex gap-2">
                  <button disabled={busy === req.id || !req.matched_user_id} onClick={() => decide(req, true)}
                    className="bg-[#1A6B3C] text-white text-[12px] rounded-[5px] px-3 py-1.5 disabled:opacity-40">Approve</button>
                  <button disabled={busy === req.id} onClick={() => decide(req, false)}
                    className="border border-[#E7E0D8] text-[12px] rounded-[5px] px-3 py-1.5 disabled:opacity-40">Reject</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Users({ guard }: { guard: Guard }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const { data, error } = useLoad(() => adminApi.users(page, query), guard, [page, query])
  return (
    <Card title="Citizens">
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search.trim()) }} className="flex gap-2 mb-3">
        <input aria-label="Search citizens" placeholder="Search name, email or mobile" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-0 bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-1.5 text-[13px]" />
        <button className="bg-[#1A6B3C] text-white text-[12px] rounded-[5px] px-3">Search</button>
      </form>
      <p className="text-[11px] text-[#78716C] mb-2">Every view of this list is recorded in the audit log.</p>
      <ErrorText error={error} />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[#57534E] border-b border-[#E7E0D8]">
            <th className="py-2 pr-3 font-medium">Name</th><th className="py-2 pr-3 font-medium">Email</th>
            <th className="py-2 pr-3 font-medium">Mobile</th><th className="py-2 pr-3 font-medium">Joined</th>
            <th className="py-2 font-medium">Last login</th>
          </tr></thead>
          <tbody>
            {data?.items.map((u: UserSummary) => (
              <tr key={u.id} className="border-b border-[#F0EBE3]">
                <td className="py-2 pr-3">{u.full_name ?? "—"}</td>
                <td className="py-2 pr-3">{u.email ?? "—"}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{u.mobile_number ?? "—"}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{fmt(u.created_at)}</td>
                <td className="py-2 whitespace-nowrap">{fmt(u.last_login_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} data={data} onPage={setPage} />}
    </Card>
  )
}

function Audit({ guard }: { guard: Guard }) {
  const [page, setPage] = useState(1)
  const { data, error } = useLoad<Paginated<AuditLog>>(() => adminApi.auditLogs(page), guard, [page])
  return (
    <Card title="Audit log">
      <ErrorText error={error} />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[#57534E] border-b border-[#E7E0D8]">
            <th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">Action</th>
            <th className="py-2 pr-3 font-medium">Actor</th><th className="py-2 font-medium">IP</th>
          </tr></thead>
          <tbody>
            {data?.items.map((log) => (
              <tr key={log.id} className="border-b border-[#F0EBE3]">
                <td className="py-2 pr-3 whitespace-nowrap">{fmt(log.created_at)}</td>
                <td className="py-2 pr-3"><code>{log.action}</code></td>
                <td className="py-2 pr-3 font-mono text-[11px]">{log.actor_id.slice(0, 8)}</td>
                <td className="py-2">{log.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} data={data} onPage={setPage} />}
    </Card>
  )
}

function Admins({ guard, me }: { guard: Guard; me: AdminMe }) {
  const { data, error, reload } = useLoad(() => adminApi.admins(), guard, [])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AdminRole>("viewer")
  const [password, setPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return setFormError(problem)
    setFormError(null)
    try {
      const admin = await adminApi.createAdmin(email.trim(), role, password)
      setCreated(`${admin.email} can now log in as ${ROLE_LABELS[admin.role]}. Share the password privately and ask them to change it under My account.`)
      setEmail(""); setPassword("")
      reload()
    } catch (err) {
      if (!guard(err)) setFormError(errorMessage(err, "Could not create the admin."))
    }
  }

  async function update(admin: AdminMe, patch: { role?: AdminRole; is_active?: boolean }) {
    try {
      await adminApi.updateAdmin(admin.id, patch)
      reload()
    } catch (err) {
      if (!guard(err)) setFormError(errorMessage(err, "Could not update the admin."))
    }
  }

  return (
    <>
      <Card title="Admins">
        <ErrorText error={error} />
        <ul className="divide-y divide-[#F0EBE3] text-[13px]">
          {data?.map((a) => (
            <li key={a.id} className="py-2 flex flex-wrap items-center gap-2">
              <span className={`flex-1 min-w-[180px] truncate ${a.is_active ? "" : "text-[#A8A29E] line-through"}`}>
                {a.email}{a.id === me.id && <span className="text-[#78716C]"> (you)</span>}
              </span>
              <select aria-label={`Role for ${a.email}`} value={a.role} disabled={a.id === me.id}
                onChange={(e) => update(a, { role: e.target.value as AdminRole })}
                className="text-[12px] border border-[#E7E0D8] rounded-[5px] px-2 py-1 bg-white disabled:opacity-60">
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {a.id !== me.id && (
                <button onClick={() => update(a, { is_active: !a.is_active })} className="text-[12px] text-[#1A6B3C] underline w-[76px] text-right">
                  {a.is_active ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Add an admin">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Field id="new-admin-email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <div>
            <label htmlFor="new-admin-role" className="mb-1 block text-[12px] font-medium text-[#57534E]">Role</label>
            <select id="new-admin-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-2 text-[14px]">
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Field id="new-admin-password" label="First password" type="text" autoComplete="off" required
              hint="At least 10 characters with letters and numbers. They should change it after first login."
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <ErrorText error={formError} />
            {created && <Notice tone="success">{created}</Notice>}
            <button className="bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2">Create admin</button>
          </div>
        </form>
      </Card>
    </>
  )
}

function MyAccount({ guard }: { guard: Guard }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(next)
    if (problem) return setError(problem)
    if (next !== confirm) return setError("The two new passwords don't match.")
    setError(null)
    try {
      await adminApi.changePassword(current, next)
      setDone(true)
      setCurrent(""); setNext(""); setConfirm("")
    } catch (err) {
      // A wrong current password is a 401 here, not an expired session.
      if (err instanceof ApiError && err.status === 401) setError(errorMessage(err, "Current password is incorrect."))
      else if (!guard(err)) setError(errorMessage(err, "Could not change the password."))
    }
  }

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <Field id="cur-pw" label="Current password" type="password" autoComplete="current-password" required
          value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field id="new-pw" label="New password" type="password" autoComplete="new-password" required
          hint="At least 10 characters, with letters and numbers." value={next} onChange={(e) => setNext(e.target.value)} />
        <Field id="confirm-pw" label="Confirm new password" type="password" autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorText error={error} />
        {done && <Notice tone="success">Password changed.</Notice>}
        <button className="bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2">Change password</button>
      </form>
    </Card>
  )
}
