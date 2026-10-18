import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/** Six single-digit boxes with paste support (`autocomplete="one-time-code"`). */
export function OtpCodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function setAt(index: number, char: string) {
    const next = digits.map((d, i) => (i === index ? char : d === " " ? "" : d));
    const joined = next.join("").replace(/\D/g, "").slice(0, 6);
    onChange(joined);
    if (char && index < 5) refs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    const focusAt = Math.min(pasted.length, 5);
    refs.current[focusAt]?.focus();
  }

  return (
    <div className="otp-boxes" role="group" aria-label="6-digit code">
      {Array.from({ length: 6 }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          className="otp-box"
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          value={digits[index]?.trim() ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const char = e.target.value.replace(/\D/g, "").slice(-1);
            setAt(index, char);
          }}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
        />
      ))}
    </div>
  );
}
