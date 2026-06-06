import { Link } from "react-router-dom";
import { PRODUCT_CATEGORIES } from "../options";

export default function ComingSoonPage({ category }: { category: "KIOSK" | "LV" }) {
  const meta = PRODUCT_CATEGORIES.find((c) => c.key === category)!;
  return (
    <div className="card flex flex-col items-center p-12 text-center animate-fade-up">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-soft">
        {category === "KIOSK" ? "🏠" : "⚡"}
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">{meta.label} Configurator</h1>
      <p className="mt-1 max-w-md text-muted">{meta.blurb}</p>
      <span className="mt-4 chip bg-brand-light text-brand-dark">Coming soon</span>
      <p className="mt-6 max-w-md text-sm text-muted">
        The {meta.label} configurator isn’t built yet. Send me the {meta.label} standards
        (like you did for RMU) and I’ll add it here — your saved {meta.label} offers will
        appear on this tab.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Go to RMU offers
      </Link>
    </div>
  );
}
