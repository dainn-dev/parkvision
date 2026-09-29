import { useEffect, useState } from "react";
import { getConfig } from "./lib/tauri";
import SetupScreen from "./screens/SetupScreen";
import OperatorScreen from "./screens/OperatorScreen";

export default function App() {
  // undefined = loading, false = needs setup, true = provisioned
  const [provisioned, setProvisioned] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    getConfig()
      .then((cfg) => setProvisioned(cfg !== null))
      .catch(() => setProvisioned(false));
  }, []);

  if (provisioned === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Đang tải…
      </main>
    );
  }
  if (!provisioned) {
    return <SetupScreen onDone={() => setProvisioned(true)} />;
  }
  return <OperatorScreen />;
}
