import { useMemo, useState } from "react";
import type { CheckinStandardKey } from "@fitbud/contracts";
import { Search } from "lucide-react";
import { Button, Modal } from "../../components/ui";
import {
  STANDARD_CHECKIN_GROUPS,
  STANDARD_PICKER_SECTIONS,
  standardKeyCopy,
  type StandardCheckinGroupId,
} from "./checkinBuilder";
import { standardRowIcon } from "./checkinIcons";

type AddProps = {
  mode: "add";
  /** Keys the form already asks: shown checked and locked. */
  added: readonly CheckinStandardKey[];
  onCancel: () => void;
  onConfirm: (keys: CheckinStandardKey[]) => void;
};

type EditProps = {
  mode: "edit";
  groupId: StandardCheckinGroupId;
  /** Keys of this group the form asks now. */
  selected: readonly CheckinStandardKey[];
  onCancel: () => void;
  onConfirm: (keys: CheckinStandardKey[]) => void;
};

/**
 * Measure picker (frame W-171b): a 560 Modal with search, rows grouped under
 * headings, a selected state, and Cancel / Add. "add" adds keys across all
 * groups (already-added rows are locked); "edit" changes which keys of one
 * group (Body measurements, Progress photos) the form asks.
 */
export function CheckinMeasurePicker(props: AddProps | EditProps) {
  const adding = props.mode === "add";
  const [picked, setPicked] = useState<CheckinStandardKey[]>(
    props.mode === "edit" ? [...props.selected] : [],
  );
  const [query, setQuery] = useState("");

  const editGroupId = props.mode === "edit" ? props.groupId : null;
  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const wanted =
      editGroupId
        ? [{ title: "", groupIds: [editGroupId] as readonly StandardCheckinGroupId[] }]
        : STANDARD_PICKER_SECTIONS;
    return wanted
      .map((section) => ({
        title: section.title,
        keys: section.groupIds
          .flatMap((id) => STANDARD_CHECKIN_GROUPS.find((group) => group.id === id)!.keys)
          .filter((key) => {
            if (!needle) return true;
            const copy = standardKeyCopy(key);
            return `${copy.label} ${copy.hint}`.toLowerCase().includes(needle);
          }),
      }))
      .filter((section) => section.keys.length > 0);
  }, [query, editGroupId]);

  const addedKeys = props.mode === "add" ? props.added : [];
  const editGroup =
    props.mode === "edit"
      ? STANDARD_CHECKIN_GROUPS.find((group) => group.id === props.groupId)!
      : null;
  const count = picked.length;
  const title = adding
    ? "Add a standard measure"
    : editGroup?.id === "photos"
      ? "Photos to collect"
      : "Measurements to collect";
  const confirmLabel = adding
    ? count === 1
      ? "Add 1 measure"
      : `Add ${count} measures`
    : "Done";

  function toggle(key: CheckinStandardKey, on: boolean) {
    setPicked((current) => (on ? [...current, key] : current.filter((value) => value !== key)));
  }

  return (
    <Modal
      open
      onClose={props.onCancel}
      title={title}
      subtitle={
        adding
          ? "Standard measures use the same wording for every client and chart in Progress."
          : editGroup?.id === "body"
            ? "All in cm. Clients see only the ones you pick."
            : "Clients see only the ones you pick."
      }
      footer={
        <>
          <span className="ck-picker-count" role="status">
            {count} selected
          </span>
          <span className="ui-sp" />
          <Button variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={count === 0}
            onClick={() => props.onConfirm(picked)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ck-picker">
        {adding ? (
          <label className="ck-search">
            <Search className="ui-i" strokeWidth={1.75} aria-hidden />
            <input
              type="search"
              value={query}
              placeholder="Search measures"
              aria-label="Search measures"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
        {sections.length === 0 ? (
          <p className="ck-picker-empty">No measure matches that search.</p>
        ) : (
          sections.map((section) => (
            <section key={section.title || "keys"} className="ck-picker-section">
              {section.title ? <h3 className="ck-picker-head">{section.title}</h3> : null}
              <ul className="ck-picker-list" aria-label={section.title || title}>
                {section.keys.map((key) => {
                  const copy = standardKeyCopy(key);
                  const locked = addedKeys.includes(key);
                  const checked = locked || picked.includes(key);
                  const lastOne = !adding && checked && picked.length === 1;
                  const Icon = standardRowIcon(key);
                  return (
                    <li key={key}>
                      <label
                        className={`ck-picker-row${checked ? " is-on" : ""}${locked ? " is-locked" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="ck-check"
                          checked={checked}
                          disabled={locked || lastOne}
                          onChange={(event) => toggle(key, event.target.checked)}
                        />
                        <span className="ck-tile" aria-hidden>
                          <Icon className="ui-i" strokeWidth={1.75} />
                        </span>
                        <span className="ck-picker-copy">
                          <span className="ck-picker-name">{copy.label}</span>
                          <span className="ck-picker-hint">
                            {copy.hint}
                            {locked ? " · already added" : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </Modal>
  );
}
