/**
 * `Field`'s accessible name (CU15), on CU6's render harness.
 *
 * The harness renders the real component tree through `react-native-web`,
 * which maps `accessibilityLabel` to `aria-label`, so `getByLabelText` and
 * `aria-label` below assert the attribute assistive tech reads. It is
 * DOM-shaped, not device-shaped: it cannot prove what VoiceOver or TalkBack
 * actually speak, only that the input carries an accessible name at all,
 * which is what `Field` controls. The device check stays with the Maestro run
 * and manual pass.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "../test/render";
import { Field } from "./Field";

describe("Field accessible name", () => {
  it("names the input with its label when the caller sets none", () => {
    render(<Field label="6-digit code" value="" onChangeText={() => {}} />);

    const input = screen.getByLabelText("6-digit code");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("aria-label")).toBe("6-digit code");
  });

  it("lets an explicit accessibilityLabel in inputProps win", () => {
    render(
      <Field
        label="Mobile number or email"
        accessibilityLabel="Mobile number or email address"
        value=""
        onChangeText={() => {}}
      />,
    );

    // The caller's label is the accessible name, and the visible label text is
    // NOT also on the input — otherwise the default would be overriding the
    // caller rather than the other way round.
    const input = screen.getByLabelText("Mobile number or email address");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("aria-label")).toBe("Mobile number or email address");
    expect(screen.queryByLabelText("Mobile number or email")).toBeNull();

    // The visible label still reads as before: this changes the announcement,
    // not the screen.
    expect(screen.getByText("Mobile number or email")).toBeTruthy();
  });

  it("gives two fields with the same label the same name, so a flow needs a testID to tell them apart", () => {
    // The spec's one caveat, pinned rather than left to prose: the label is an
    // accessible name, not an identifier. Two same-labelled fields on one
    // screen are ambiguous for both a screen reader and a Maestro `tapOn`, and
    // the caller has to disambiguate. No screen on `main` does this today (see
    // the PR's caller audit), so this is a guard on the contract, not on a
    // current screen.
    render(
      <>
        <Field label="6-digit code" testID="first-code" value="" onChangeText={() => {}} />
        <Field label="6-digit code" testID="second-code" value="" onChangeText={() => {}} />
      </>,
    );

    expect(screen.getAllByLabelText("6-digit code")).toHaveLength(2);
    // `testID` reaches react-native-web as the DOM id, which is what stays
    // unambiguous.
    expect(screen.getByTestId("first-code").getAttribute("aria-label")).toBe("6-digit code");
    expect(screen.getByTestId("second-code").getAttribute("aria-label")).toBe("6-digit code");
  });

  it("keeps the hint as its own text rather than folding it into the name", () => {
    render(
      <Field
        label="New password"
        hint="At least 8 characters."
        value=""
        onChangeText={() => {}}
      />,
    );

    expect(screen.getByLabelText("New password").getAttribute("aria-label")).toBe(
      "New password",
    );
    expect(screen.getByText("At least 8 characters.")).toBeTruthy();
  });
});
