type BuilderMode = "simple" | "pro";

type ModeSwitcherProps = {
  mode: BuilderMode;
  onChange: (mode: BuilderMode) => void;
};

const MODES: Array<{ id: BuilderMode; label: string; description: string }> = [
  { id: "simple", label: "Simple", description: "Guiado" },
  { id: "pro", label: "Pro", description: "Pydicate" },
];

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {MODES.map((item) => {
        const isActive = item.id === mode;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isActive
                ? "border-accent bg-accent text-accent-contrast"
                : "border-brand-200 bg-surface-soft text-brand-800 hover:border-brand-400"
            }`}
            aria-pressed={isActive}
          >
            <span>{item.label}</span>
            <span className={isActive ? "text-white/80" : "text-slate-500"}> · {item.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export type { BuilderMode };
