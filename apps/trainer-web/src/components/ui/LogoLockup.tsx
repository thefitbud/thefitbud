import markUrl from "../../assets/logo/runnerup-honest-week-mark.svg";
import wordmarkUrl from "../../assets/logo/fitbud-wordmark-navy-mono.svg";

/** Honest Week mark + navy wordmark. The files themselves, never redrawn type. */
export function LogoLockup() {
  return (
    <span className="ui-lockup">
      <span className="ui-lockup-mark">
        <img src={markUrl} alt="" />
      </span>
      <img className="ui-lockup-words" src={wordmarkUrl} alt="FitBud" />
    </span>
  );
}
