"use client";

export default function MultiSelectPills({
  items,
  selected,
  onToggle,
}: {
  items: { key: string; label: string; count?: number }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const allSelected = selected.size === 0;

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => {
          // Clear selection to mean "all"
          if (!allSelected) {
            for (const k of selected) onToggle(k);
          }
        }}
        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
          allSelected
            ? "bg-blue-600 text-white"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
      >
        All
      </button>
      {items.map((item) => {
        const isSelected = selected.has(item.key);
        return (
          <button
            key={item.key}
            onClick={() => onToggle(item.key)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              isSelected
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ml-1 opacity-60">({item.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
