import { Lock } from 'lucide-react'

type LoginPageProps = {
  username: string
  password: string
  loginError: string
  loginSubmitting: boolean
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void
}

export function LoginPage({
  username,
  password,
  loginError,
  loginSubmitting,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: LoginPageProps) {
  return (
    <section className="mx-auto mt-8 w-full max-w-md rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Sign In</h2>
          <p className="text-sm text-slate-500">Authenticate to access the dashboard.</p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            data-testid="login-username"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>

        <button
          type="button"
          className="inline-flex w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-300"
          data-testid="login-submit"
          disabled={loginSubmitting}
          onClick={onSubmit}
        >
          {loginSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </div>

      {loginError && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="login-error">
          {loginError}
        </p>
      )}
    </section>
  )
}
