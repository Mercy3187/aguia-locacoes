import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

type Tone = "default" | "neon" | "success" | "warning" | "danger" | "purple";

/** Cor do número. `neon` é o vermelho da marca. */
const TONE_CLASSES: Record<Tone, string> = {
  default: "text-foreground",
  neon: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  purple: "text-purple",
};

/** Cor da caixinha do ícone, no mesmo tom do número mas bem mais discreta. */
const ICON_CLASSES: Record<Tone, string> = {
  default: "border-border bg-surface-2 text-muted",
  neon: "border-brand/25 bg-brand/10 text-brand",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  purple: "border-purple/25 bg-purple/10 text-purple",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <div className="card-sheen rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg border",
              ICON_CLASSES[tone]
            )}
          >
            <Icon name={icon} className="size-[17px]" />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-3 text-[28px] font-bold leading-none tracking-tight tabular-nums",
          TONE_CLASSES[tone]
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}
