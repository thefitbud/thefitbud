import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import {
  avatarTone,
  clientInitials,
  clientStatusLabel,
  type ApplyClient,
} from "./shared";
import "./TemplatesModals.css";

/** Searchable client picker for the Use-for-client dialogs (W-174). */
export function ClientCombobox({
  clients,
  value,
  onChange,
}: {
  clients: ApplyClient[];
  value: string;
  onChange: (relationshipId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = clients.find((c) => c.relationshipId === value) ?? null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) =>
      (c.traineeDisplayName ?? "").toLowerCase().includes(needle),
    );
  }, [clients, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function face(client: ApplyClient, inTrigger: boolean) {
    const name = client.traineeDisplayName ?? "Client";
    return (
      <>
        <span
          className={`ui-av is-sm ui-av${avatarTone(client.relationshipId)}`}
          aria-hidden="true"
        >
          {clientInitials(name)}
        </span>
        <span className="tpl-combo-name">{name}</span>
        <span className="tpl-combo-status">
          {inTrigger ? null : (
            <span className="tpl-combo-sep" aria-hidden="true">
              ·
            </span>
          )}
          <span>{clientStatusLabel(client.status)}</span>
        </span>
      </>
    );
  }

  const Caret = open ? ChevronUp : ChevronDown;

  return (
    <div className="tpl-combo" ref={rootRef}>
      <button
        type="button"
        className={`tpl-combo-trigger${open ? " is-open" : ""}`}
        role="combobox"
        aria-label="Client"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? face(selected, true) : <span>Choose a client</span>}
        <Caret className="tpl-combo-caret" size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="tpl-combo-pop">
          <label className="tpl-combo-search">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Search clients</span>
            <input
              autoFocus
              type="search"
              placeholder="Search clients"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ul id={listId} role="listbox" aria-label="Clients">
            {visible.map((client) => {
              const on = client.relationshipId === value;
              return (
                <li key={client.relationshipId} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={on ? "is-on" : undefined}
                    onClick={() => {
                      onChange(client.relationshipId);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {face(client, false)}
                    {on ? (
                      <Check
                        className="tpl-combo-check"
                        size={18}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
            {visible.length === 0 ? (
              <li className="tpl-combo-none">No clients match.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
