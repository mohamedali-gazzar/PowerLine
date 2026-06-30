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
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
  setUser: (u: AuthUser) => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api.auth
      .me()
      .then((r) => setUserState(r.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const signIn = (token: string, u: AuthUser) => {
    setToken(token);
    setUserState(u);
  };
  const signOut = () => {
    clearToken();
    setUserState(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut, setUser: setUserState }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within <AuthProvider>");
  return c;
}
