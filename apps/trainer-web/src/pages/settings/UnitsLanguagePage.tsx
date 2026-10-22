import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";

export type UnitPrefs = {
  weight: "kg" | "lb";
  length: "cm" | "in";
  language: "en";
};

const DEFAULT_PREFS: UnitPrefs = {
  weight: "kg",
  length: "cm",
  language: "en",
};

function storageKey(userId: string): string {
  return `fitbud.trainer.units.${userId}`;
}

function readPrefs(userId: string): UnitPrefs {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UnitPrefs>;
    return {
      weight: parsed.weight === "lb" ? "lb" : "kg",
      length: parsed.length === "in" ? "in" : "cm",
      language: "en",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function UnitsLanguagePage() {
  const { me } = useAuth();
  const userId = me?.userId ?? "anonymous";
  const [weight, setWeight] = useState<UnitPrefs["weight"]>("kg");
  const [length, setLength] = useState<UnitPrefs["length"]>("cm");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const prefs = readPrefs(userId);
    setWeight(prefs.weight);
    setLength(prefs.length);
  }, [userId]);

  function save(event: FormEvent) {
    event.preventDefault();
    const prefs: UnitPrefs = { weight, length, language: "en" };
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
    setToast("Units saved.");
    window.setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="settings-panel stack-lg">
      <h2>Units &amp; language</h2>
      <p className="muted">
        Progress and measurements use these units on your screen. Stored values
        stay in metric on the server.
      </p>
      <form className="stack-form" onSubmit={save}>
        <fieldset className="field">
          <legend>Weight</legend>
          <label className="switch-row">
            <input
              type="radio"
              name="weight"
              checked={weight === "kg"}
              onChange={() => setWeight("kg")}
            />
            Kilograms (kg)
          </label>
          <label className="switch-row">
            <input
              type="radio"
              name="weight"
              checked={weight === "lb"}
              onChange={() => setWeight("lb")}
            />
            Pounds (lb)
          </label>
        </fieldset>
        <fieldset className="field">
          <legend>Length</legend>
          <label className="switch-row">
            <input
              type="radio"
              name="length"
              checked={length === "cm"}
              onChange={() => setLength("cm")}
            />
            Centimetres (cm)
          </label>
          <label className="switch-row">
            <input
              type="radio"
              name="length"
              checked={length === "in"}
              onChange={() => setLength("in")}
            />
            Inches (in)
          </label>
        </fieldset>
        <label className="field">
          <span>Interface language</span>
          <select value="en" disabled aria-readonly="true">
            <option value="en">English</option>
          </select>
          <span className="muted">More languages coming later.</span>
        </label>
        <button type="submit" className="button-primary">
          Save
        </button>
      </form>
      {toast ? (
        <p className="form-success" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
