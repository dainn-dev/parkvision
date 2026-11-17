import { Check, X } from "lucide-react";
import { reasonText } from "../../lib/labels";

export function DecisionBanner({
  decision,
  reason,
}: {
  decision: string;
  reason: string | null | undefined;
}) {
  if (decision === "allow") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-[10px] bg-allow px-4 py-3.5 text-white">
        <Check aria-hidden size={26} />
        <span className="text-[22px] font-extrabold leading-7">MỜI QUA</span>
      </div>
    );
  }
  const text = reasonText(reason);
  return (
    <div role="alert" className="flex items-center gap-3 rounded-[10px] bg-deny px-4 py-3.5 text-white">
      <X aria-hidden size={26} />
      <span className="text-[22px] font-extrabold leading-7">TỪ CHỐI</span>
      <span className="min-w-0 truncate text-[15px] font-medium" title={text}>
        {text}
      </span>
    </div>
  );
}
