import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "signup" | "forgot";

/** The login wall — sign in, sign up (email → emailed code → password), or reset
 *  a forgotten password. Shown whenever no user is signed in. */
export default function AuthPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState(0); // 0 = email/login, 1 = code + password
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState(""); // shown when email isn't configured

  const reset = (m: Mode) => {
    setMode(m);
    setStep(0);
    setError("");
    setDevCode("");
    setPassword("");
    setCode("");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // LOGIN
  const doLogin = () =>
    run(async () => {
      const r = await api.auth.login(email, password);
      signIn(r.token, r.user);
    });

  // SIGNUP — step 0: send code
  const doRegister = () =>
    run(async () => {
      const r = await api.auth.register(email);
      if (r.devCode) setDevCode(r.devCode);
      setStep(1);
    });
  // SIGNUP — step 1: verify code + set password
  const doComplete = () =>
    run(async () => {
      const r = await api.auth.complete(email, code, password, name);
      signIn(r.token, r.user);
    });

  // FORGOT — step 0: send reset code
  const doForgot = () =>
    run(async () => {
      const r = await api.auth.forgot(email);
      if (r.devCode) setDevCode(r.devCode);
      setStep(1);
    });
  // FORGOT — step 1: reset password with code
  const doReset = () =>
    run(async () => {
      const r = await api.auth.reset(email, code, password);
      signIn(r.token, r.user);
    });

  const title =
    mode === "login" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset password";
  const subtitle =
    mode === "login"
      ? "Welcome back to the PowerLine configurator."
      : mode === "signup"
      ? step === 0
        ? "Enter your email — we'll send you a verification code."
        : "Enter the code we emailed, then set a password."
      : step === 0
      ? "Enter your email — we'll send a reset code."
      : "Enter the code and choose a new password.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/brand/logo-color.png" alt="PowerLine" className="mx-auto h-12 w-auto" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-muted">
            Offer Configurator
          </p>
        </div>

        <div className="rounded-xl2 border border-line bg-white p-6 shadow-lift animate-pop">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">{title}</h1>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}
          {devCode && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <b>Dev mode</b> (no email configured) — your code is{" "}
              <span className="font-mono text-base font-bold">{devCode}</span>
            </div>
          )}

          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              if (mode === "login") doLogin();
              else if (mode === "signup") (step === 0 ? doRegister : doComplete)();
              else (step === 0 ? doForgot : doReset)();
            }}
          >
            {/* Email — shown except on the code step */}
            {step === 0 && (
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" autoFocus required className="input"
                  placeholder="you@company.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
            )}

            {/* Login password */}
            {mode === "login" && (
              <div>
                <label className="label" htmlFor="pw">Password</label>
                <input id="pw" type="password" required className="input" placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}

            {/* Code + password step (signup / forgot) */}
            {step === 1 && (
              <>
                <div className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                  Code sent to <b className="text-ink">{email}</b>{" "}
                  <button type="button" className="ml-1 font-semibold text-brand hover:underline"
                    onClick={() => setStep(0)}>change</button>
                </div>
                <div>
                  <label className="label" htmlFor="code">Verification code</label>
                  <input id="code" inputMode="numeric" autoFocus required className="input font-mono tracking-widest"
                    placeholder="6-digit code" value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} />
                </div>
                {mode === "signup" && (
                  <div>
                    <label className="label" htmlFor="name">Your name <span className="font-normal text-muted">(optional)</span></label>
                    <input id="name" className="input" placeholder="e.g. Mohamed Ali"
                      value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="npw">{mode === "signup" ? "Create a password" : "New password"}</label>
                  <input id="npw" type="password" required className="input" placeholder="At least 8 characters"
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                ? "Sign in"
                : mode === "signup"
                ? step === 0
                  ? "Send code"
                  : "Create account"
                : step === 0
                ? "Send reset code"
                : "Reset password"}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            {mode === "login" ? (
              <>
                <button className="font-semibold text-brand hover:underline" onClick={() => reset("forgot")}>
                  Forgot password?
                </button>
                <button className="hover:text-ink" onClick={() => reset("signup")}>
                  No account? <b className="text-brand">Sign up</b>
                </button>
              </>
            ) : (
              <button className="font-semibold text-brand hover:underline" onClick={() => reset("login")}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted">powerline.com.eg</p>
      </div>
    </div>
  );
}
