import { useCallback, useEffect, useRef, useState } from "react";
import { getConfig, lockStatus, onDeprovisioned } from "./lib/tauri";
import { useEdgeData } from "./lib/useEdgeData";
import ActivationScreen from "./screens/ActivationScreen";
import LockScreen from "./screens/LockScreen";
import MonitorScreen from "./screens/MonitorScreen";
import SettingsScreen from "./screens/SettingsScreen";
import Toast from "./components/ui/Toast";

type Screen = "loading" | "activation" | "locked" | "monitor" | "settings";

const TOAST_MS = 3000;

/** Owns the single live-data subscription and the toast for monitor + settings. */
function Workspace({
  screen,
  setScreen,
}: {
  screen: "monitor" | "settings";
  setScreen: (s: Screen) => void;
}) {
  const data = useEdgeData();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <>
      {/* Stays mounted while Settings is open so each lane keeps its remembered
          quote and printed-sessions set (a bank transfer can settle meanwhile). */}
      <div
        data-testid="monitor-host"
        hidden={screen !== "monitor"}
        aria-hidden={screen !== "monitor"}
        style={screen !== "monitor" ? { display: "none" } : undefined}
      >
        <MonitorScreen data={data} onOpenSettings={() => setScreen("settings")} notify={notify} />
      </div>
      {screen === "settings" ? (
        <SettingsScreen
          data={data}
          onBack={() => setScreen("monitor")}
          onLocked={() => setScreen("locked")}
          notify={notify}
        />
      ) : null}
      {toast && <Toast message={toast} />}
    </>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [revoked, setRevoked] = useState(false);
  // Set once a deprovision arrives, so a slower initial check cannot undo it.
  const deprovisioned = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await getConfig().catch(() => null);
      if (cancelled || deprovisioned.current) return;
      if (!cfg) {
        setScreen("activation");
        return;
      }
      const lock = await lockStatus().catch(() => ({ enabled: false, locked: false }));
      if (cancelled || deprovisioned.current) return;
      setScreen(lock.locked ? "locked" : "monitor");
    })();
    // Tenant admin revoked the credential — runtime wiped config.
    const un = onDeprovisioned(() => {
      deprovisioned.current = true;
      setRevoked(true);
      setScreen("activation");
    });
    return () => {
      cancelled = true;
      un.then((f) => f());
    };
  }, []);

  if (screen === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950 text-zinc-400">
        Đang tải…
      </main>
    );
  }
  if (screen === "activation") {
    return (
      <ActivationScreen
        revoked={revoked}
        onDone={(next) => {
          setRevoked(false);
          setScreen(next);
        }}
      />
    );
  }
  if (screen === "locked") {
    return <LockScreen onUnlocked={() => setScreen("monitor")} />;
  }
  return <Workspace screen={screen} setScreen={setScreen} />;
}
