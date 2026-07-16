import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exchangeLaunchToken,
  fetchSessionUser,
  logoutSession,
  takePendingLaunchToken,
  MATRIX_PLATFORM_URL,
  type MatrixUser,
} from "@/lib/matrix-platform";

interface MatrixAuthContextValue {
  user: MatrixUser;
  logout: () => Promise<void>;
}

const MatrixAuthContext = createContext<MatrixAuthContextValue | null>(null);

export function useMatrixAuth(): MatrixAuthContextValue {
  const ctx = useContext(MatrixAuthContext);
  if (!ctx) throw new Error("useMatrixAuth must be used within MatrixGate");
  return ctx;
}

type GateState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: MatrixUser };

export function MatrixGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const launchToken = takePendingLaunchToken();
      let user: MatrixUser | null = null;
      if (launchToken) {
        user = await exchangeLaunchToken(launchToken);
      }
      if (!user) {
        user = await fetchSessionUser();
      }
      if (cancelled) return;
      setState(user ? { status: "authenticated", user } : { status: "unauthenticated" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-muted/20">
        <div className="text-sm text-muted-foreground">Verifying Matrix Platform session…</div>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-muted/20 p-4">
        <div className="max-w-md w-full rounded-lg border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Matrix Platform sign-in required
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This application is managed by Matrix Platform. Launch it from Matrix
            Platform to continue.
          </p>
          <Button asChild className="mt-6">
            <a href={MATRIX_PLATFORM_URL}>Go to Matrix Platform</a>
          </Button>
        </div>
      </div>
    );
  }

  const logout = async () => {
    await logoutSession();
    setState({ status: "unauthenticated" });
  };

  return (
    <MatrixAuthContext.Provider value={{ user: state.user, logout }}>
      {children}
    </MatrixAuthContext.Provider>
  );
}
