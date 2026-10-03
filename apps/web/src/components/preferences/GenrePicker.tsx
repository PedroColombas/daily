import { Chip } from "../ui/Chip";
import { GENRES } from "../../lib/preferences-options";
import { useTopicLabel } from "../../i18n/LanguageProvider";

export function GenrePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (genre: string) => void;
}) {
  const label = useTopicLabel();
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((g) => (
        <Chip key={g} label={label(g)} selected={selected.includes(g)} onClick={() => onToggle(g)} />
      ))}
    </div>
  );
}
