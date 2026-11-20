import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Radio } from "../../components/ui/Field";
import { SettingsCard, SettingsRow } from "./SettingsLayout";

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
    <form onSubmit={save} data-testid="screen-settings-units">
      <SettingsCard
        title="Units and language"
        aside="Stored values stay in metric on the server"
        footer={
          <>
            <span className="settings-saved">{toast ?? "Progress on your screen uses these units."}</span>
            <span className="sp" />
            <Button type="submit">Save</Button>
          </>
        }
      >
        <SettingsRow label="Weight" help="Kilograms or pounds">
          <Radio checked={weight === "kg"} onChange={() => setWeight("kg")}>
            Kilograms (kg)
          </Radio>
          <Radio checked={weight === "lb"} onChange={() => setWeight("lb")}>
            Pounds (lb)
          </Radio>
        </SettingsRow>
        <SettingsRow label="Length" help="Centimetres or inches">
          <Radio checked={length === "cm"} onChange={() => setLength("cm")}>
            Centimetres (cm)
          </Radio>
          <Radio checked={length === "in"} onChange={() => setLength("in")}>
            Inches (in)
          </Radio>
        </SettingsRow>
        <SettingsRow label="Interface language" help="More languages coming later.">
          <div className="ui-select settings-native-select" aria-disabled="true">
            English
          </div>
        </SettingsRow>
      </SettingsCard>
    </form>
  );
}
