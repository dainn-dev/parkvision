import { useEffect, useState } from "react";
import { getConfig, lockStatus, onDeprovisioned } from "./lib/tauri";
import SetupScreen from "./screens/SetupScreen";
import LockScreen from "./screens/LockScreen";
import OperatorScreen from "./screens/OperatorScreen";

type Screen = "loading" | "setup" | "locked" | "operator";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");

  const check = async () => {
    const cfg = await getConfig().catch(() => null);
    if (!cfg) {
      setScreen("setup");
      return;
    }
    const lock = await lockStatus().catch(() => ({ enabled: false, locked: false }));
    setScreen(lock.locked ? "locked" : "operator");
  };

  useEffect(() => {
    check();
    // Tenant admin revoked the credential — runtime wiped config; go back
    // to the activation screen.
    const un = onDeprovisioned(() => setScreen("setup"));
    return () => {
      un.then((f) => f());
    };
  }, []);

  if (screen === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Đang tải…
      </main>
    );
  }
  if (screen === "setup") {
    return <SetupScreen onDone={() => setScreen("operator")} />;
  }
  if (screen === "locked") {
    return <LockScreen onUnlocked={() => setScreen("operator")} />;
  }
  return <OperatorScreen onLocked={() => setScreen("locked")} />;
}
