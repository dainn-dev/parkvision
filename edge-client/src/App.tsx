import { useEffect, useState } from "react";
import { deviceIp, getConfig, lockStatus, onDeprovisioned } from "./lib/tauri";
import SetupScreen from "./screens/SetupScreen";
import LockScreen from "./screens/LockScreen";
import OperatorScreen from "./screens/OperatorScreen";

type Screen = "loading" | "setup" | "locked" | "operator";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [ip, setIp] = useState<string | null>(null);

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
    deviceIp()
      .then(setIp)
      .catch(() => {});
    // Tenant admin revoked the credential — runtime wiped config; go back
    // to the activation screen.
    const un = onDeprovisioned(() => setScreen("setup"));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const screenEl =
    screen === "loading" ? (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Đang tải…
      </main>
    ) : screen === "setup" ? (
      <SetupScreen onDone={() => setScreen("operator")} />
    ) : screen === "locked" ? (
      <LockScreen onUnlocked={() => setScreen("operator")} />
    ) : (
      <OperatorScreen onLocked={() => setScreen("locked")} />
    );

  return (
    <>
      {screenEl}
      {ip && (
        <div
          className="fixed bottom-2 right-3 z-50 select-all font-mono text-[11px] text-zinc-600"
          title="IP của thiết bị này"
        >
          IP: {ip}
        </div>
      )}
    </>
  );
}
