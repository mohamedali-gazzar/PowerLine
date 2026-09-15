import { useEffect, useRef, useState } from "react";
import RmuConfigForm, { DEFAULT_RMU_CONFIG, rmuShortCode } from "./RmuConfigForm";
import { api } from "../api";
import type { GeneratedOffer, RmuConfigInput } from "../types";
import type { LvPanel } from "../lv/store";

/**
 * The editor shown for an MV "RMU" package panel. It reuses the EXACT RMU
 * configurator form and the EXACT backend pricing endpoint the standalone RMU
 * offer uses — the config lives on the panel (`p.mvRmuConfig`) so it saves and
 * shares with the quotation like everything else in MV.
 */
export default function MvRmuPanelEditor({
  p,
  upPanel,
}: {
  p: LvPanel;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
}) {
  const rmu = p.mvRmuConfig ?? DEFAULT_RMU_CONFIG;
  // Writes route through upPanel, which already drops edits on a read-only /
  // teammate quotation — so no extra guard is needed here.
  const setR = <K extends keyof RmuConfigInput>(k: K, v: RmuConfigInput[K]) =>
    upPanel(p.id, { mvRmuConfig: { ...rmu, [k]: v } });

  const code = rmuShortCode(rmu);

  // Backend preview → the official panel code (and, later, pricing). Keyed by the
  // config signature and debounced so a burst of keystrokes fires one request; the
  // ref check drops any response that arrives after the config moved on again.
  const [preview, setPreview] = useState<GeneratedOffer | null>(null);
  const sig = JSON.stringify(rmu);
  const latest = useRef(sig);
  useEffect(() => {
    latest.current = sig;
    let alive = true;
    const t = setTimeout(() => {
      api
        .previewConfig(rmu)
        .then((g) => { if (alive && latest.current === sig) setPreview(g); })
        .catch(() => { if (alive && latest.current === sig) setPreview(null); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const panelCode = preview?.panelCode || preview?.configCode || "…";

  return (
    <div className="animate-fade-up">
      <RmuConfigForm value={rmu} onChange={setR} code={code} panelCode={panelCode} />
    </div>
  );
}
