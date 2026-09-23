import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken, clearToken, type AuthUser } from "../api";

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean; // initial /me check in progress
  /** Signed in, but the server could not be reached to confirm it. NOT the same as signed out. */
  serverUnreachable: boolean;
  /** Re-run the session check — for the "Try again" button on the unreachable screen. */
  retry: () => void;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
  setUser: (u: AuthUser) => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverUnreachable, setUnreachable] = useState(false);

  /**
   * Confirm the stored session.
   *
   * ONLY THE SERVER SAYING "NO" ENDS A SESSION. This used to clear the token on any failure
   * at all, so opening the app with no internet threw the token away and showed the sign-in
   * form — the user appeared to be signed out and could not sign back in, because they were
   * offline. That is dangerous rather than merely annoying: someone who thinks their login
   * is broken clears the browser data to fix it, and that destroys the unsaved work this
   * device is holding for them (see lv/offlineBackup.ts).
   */
  const check = () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.auth
      .me()
      .then((r) => { setUserState(r.user); setUnreachable(false); })
      .catch((e: { status?: number }) => {
        const status = e?.status;
        if (status === 401 || status === 403) { clearToken(); setUnreachable(false); }
        else setUnreachable(true); // no network, or the server is down — keep the session
      })
      .finally(() => setLoading(false));
  };

  useEffect(check, []);

  const signIn = (token: string, u: AuthUser) => {
    setToken(token);
    setUserState(u);
  };
  const signOut = () => {
    clearToken();
    setUserState(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, serverUnreachable, retry: check, signIn, signOut, setUser: setUserState }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within <AuthProvider>");
  return c;
}
