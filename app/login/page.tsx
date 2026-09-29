"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { SetupNotice } from "@/components/SetupNotice";
import { auth } from "@/lib/auth";
import type { EmailCodeSignIn, PasswordSignIn } from "@/lib/auth/types";

type Stage = "email" | "code";

export default function LoginPage() {
  if (!auth.configured) return <SetupNotice />;
  if (auth.signIn.kind === "password") return <PasswordForm signIn={auth.signIn} />;
  return <SignIn signIn={auth.signIn} />;
}

/** True until we know there is no session. With one, straight to the notes. */
function useCheckingSession() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void auth.getSession().then((session) => {
      if (session) window.location.replace("/app");
      else setChecking(false);
    });
  }, []);

  return checking;
}

function Checking() {
  return (
    <main className="fixed inset-0 grid place-items-center overflow-hidden overscroll-none bg-sunken">
      <Icon name="refresh" size={16} className="animate-spin text-muted" />
    </main>
  );
}

/** For a self-hosted server started with a password. */
function PasswordForm({ signIn }: { signIn: PasswordSignIn }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checking = useCheckingSession();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const submitError = await signIn.submit(password);
    if (submitError) {
      setBusy(false);
      setError(submitError);
      return;
    }
    window.location.replace("/app");
  };

  if (checking) return <Checking />;

  return (
    <main className="fixed inset-0 grid place-items-center overflow-hidden overscroll-none bg-sunken px-5">
      <div className="w-full max-w-[420px]">
        <div className="rounded-xl border border-line bg-raised p-8 shadow-[var(--shadow-subtle)]">
          <form onSubmit={submit}>
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
              Sign into Jottr
            </h1>
            <p className="mt-1 leading-relaxed text-muted">
              Enter the password this server was set up with.
            </p>

            <label
              htmlFor="password"
              className="mt-4 block text-[12.5px] font-medium text-muted pointer-coarse:text-[13.5px]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 leading-snug text-[length:var(--body-size)] outline-none transition-colors placeholder:text-faint focus:border-[var(--accent)] pointer-coarse:py-2.5"
            />

            <Submit busy={busy} label="Sign in" icon="check" />
            {error && <ErrorNote>{error}</ErrorNote>}
          </form>
        </div>
      </div>
    </main>
  );
}

function SignIn({ signIn }: { signIn: EmailCodeSignIn }) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checking = useCheckingSession();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const sendError = await signIn.sendCode(email.trim());
    setBusy(false);
    if (sendError) setError(sendError);
    else setStage("code");
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const verifyError = await signIn.verifyCode(email.trim(), code.trim());
    if (verifyError) {
      setBusy(false);
      setError(verifyError);
      return;
    }
    window.location.replace("/app");
  };

  if (checking) return <Checking />;

  return (
    <main className="fixed inset-0 grid place-items-center overflow-hidden overscroll-none bg-sunken px-5">
      <div className="w-full max-w-[420px]">
        <div className="rounded-xl border border-line bg-raised p-8 shadow-[var(--shadow-subtle)]">
          {stage === "email" ? (
            <form onSubmit={sendCode}>
              <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
                Sign into Jottr
              </h1>
              <p className="mt-1 leading-relaxed text-muted">
                Enter your email address below to sign in. This will create an account if you
                don&apos;t already have one.
              </p>

              <label
                htmlFor="email"
                className="mt-4 block text-[12.5px] font-medium text-muted pointer-coarse:text-[13.5px]"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 leading-snug text-[length:var(--body-size)] outline-none transition-colors placeholder:text-faint focus:border-[var(--accent)] pointer-coarse:py-2.5"
              />

              <Submit busy={busy} label="Send sign in code" icon="mail" />
              {error && <ErrorNote>{error}</ErrorNote>}
            </form>
          ) : (
            <form onSubmit={verify}>
              <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
                Check your email
              </h1>
              <p className="mt-1 leading-relaxed text-muted">
                A sign in code has been sent to{" "}
                <span className="font-medium text-ink">{email}</span>. Enter it below or click the
                link in the email to sign in directly.
              </p>

              <label
                htmlFor="code"
                className="mt-4 block text-[12.5px] font-medium text-muted pointer-coarse:text-[13.5px]"
              >
                Six-digit code
              </label>
              <CodeField value={code} onChange={setCode} inputRef={codeRef} busy={busy} />

              {error && <ErrorNote>{error}</ErrorNote>}

              <button
                type="button"
                onClick={() => {
                  setStage("email");
                  setCode("");
                  setError(null);
                }}
                className="-ml-2 mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-muted transition-colors hover:bg-[var(--hover)] hover:text-ink pointer-coarse:py-2 pointer-coarse:text-[14px]"
              >
                <Icon name="arrowLeft" size={14} />
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

const CODE_LENGTH = 6;

/** Six boxes, but one real input laid over them, so typing, deleting,
 *  select-all and the one-time-code autofill all behave as a single field
 *  would. The boxes only draw its digits. The form submits itself once the
 *  last digit is in, however it arrived. */
function CodeField({
  value,
  onChange,
  inputRef,
  busy,
}: {
  value: string;
  onChange: (code: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const current = Math.min(value.length, CODE_LENGTH - 1);

  const enter = (input: HTMLInputElement, digits: string) => {
    if (digits.length < CODE_LENGTH) {
      onChange(digits);
      return;
    }
    // Flushed first, so the submit reads the whole code rather than the
    // digits before it.
    flushSync(() => onChange(digits));
    if (!busy) input.form?.requestSubmit();
  };

  return (
    <div className={`relative mt-1 transition-opacity ${busy ? "opacity-60" : ""}`}>
      <div aria-hidden="true" className="grid grid-cols-6 gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <div
            key={index}
            className={`grid aspect-square place-items-center rounded-lg border leading-snug text-[length:var(--body-size)] font-medium text-ink transition-colors ${
              focused && index === current ? "border-[var(--accent)]" : "border-line"
            }`}
          >
            {value[index] ?? "\u00a0"}
          </div>
        ))}
      </div>
      <input
        id="code"
        ref={inputRef}
        required
        readOnly={busy}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={value}
        onChange={(event) => enter(event.currentTarget, event.target.value.replace(/\D/g, ""))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={(event) => {
          // The caret is not drawn, so it stays at the end, where the next
          // digit's box is lit. Selecting the whole code is left alone, so it
          // can still be cleared in one go.
          const input = event.currentTarget;
          const end = input.value.length;
          const whole = input.selectionStart === 0 && input.selectionEnd === end;
          if (!whole && (input.selectionStart !== end || input.selectionEnd !== end)) {
            input.setSelectionRange(end, end);
          }
        }}
        onPaste={(event) => {
          // Taken whole, so a code pasted along with the words around it
          // still fills every box.
          const digits = event.clipboardData.getData("text").replace(/\D/g, "");
          if (digits.length !== CODE_LENGTH) return;
          event.preventDefault();
          enter(event.currentTarget, digits);
        }}
        // The lit box shows focus, so the page-wide focus ring, which would
        // circle all six, is overruled.
        className="absolute inset-0 size-full bg-transparent text-[length:var(--body-size)] text-transparent caret-transparent outline-none! selection:bg-transparent"
      />
    </div>
  );
}

function Submit({ busy, label, icon }: { busy: boolean; label: string; icon: "mail" | "check" }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-3 flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-60 pointer-coarse:py-2.5"
    >
      {busy ? (
        <Icon name="refresh" size={14} className="animate-spin" />
      ) : (
        <Icon name={icon} size={14} />
      )}
      {busy ? "Working…" : label}
    </button>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-danger pointer-coarse:text-[13.5px]"
    >
      <Icon name="alert" size={13} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}
