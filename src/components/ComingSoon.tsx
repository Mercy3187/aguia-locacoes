export function ComingSoon({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
      </header>
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="inline-block rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-xs font-medium text-neon">
          Em construção · {phase}
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
