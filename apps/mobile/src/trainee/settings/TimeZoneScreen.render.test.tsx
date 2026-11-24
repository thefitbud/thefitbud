/**
 * Time zone list (Z14-14, TR-20h): search by abbreviation, city and country,
 * the "Use phone's time zone" row, the saved toast and the no-match state.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../../test/render";
import { TimeZoneScreen } from "./TimeZoneScreen";

function renderList(onPick = vi.fn(), onBack = vi.fn(), current = "Asia/Kolkata") {
  render(
    <TimeZoneScreen current={current} onPick={onPick} onBack={onBack} returnDelayMs={0} />,
  );
  return { onPick, onBack };
}

function search(text: string) {
  fireEvent.change(screen.getByLabelText("Search city or time zone"), {
    target: { value: text },
  });
}

describe("TimeZoneScreen", () => {
  it("lists zones as city, readable name and UTC offset, with the phone row on top", () => {
    renderList();
    expect(screen.getByText("Use phone's time zone")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Kolkata, India Standard Time · UTC\+5:30$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^London, Greenwich Mean Time/ })).toBeTruthy();
  });

  it("finds Kolkata by IST, by city and by country, and London by name", () => {
    renderList();
    search("IST");
    expect(screen.getByRole("button", { name: /^Kolkata,/ })).toBeTruthy();
    search("Kolkata");
    expect(screen.getByRole("button", { name: /^Kolkata,/ })).toBeTruthy();
    search("India");
    expect(screen.getByRole("button", { name: /^Kolkata,/ })).toBeTruthy();
    search("London");
    expect(screen.getByRole("button", { name: /^London,/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Kolkata,/ })).toBeNull();
  });

  it("says what to try when nothing matches", () => {
    renderList();
    search("Lakeview");
    expect(screen.getByText("No time zone matches “Lakeview”")).toBeTruthy();
    expect(screen.getByText(/Try the nearest big city/)).toBeTruthy();
  });

  it("saves the pick, shows the toast with the offset and returns", async () => {
    const { onPick, onBack } = renderList();
    fireEvent.click(screen.getByRole("button", { name: /^Dubai,/ }));
    expect(onPick).toHaveBeenCalledWith("Asia/Dubai");
    expect(screen.getByText("Time zone set to Dubai · UTC+4:00")).toBeTruthy();
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it("any zone can be picked, not only the phone's", () => {
    const { onPick } = renderList();
    search("new york");
    fireEvent.click(screen.getByRole("button", { name: /^New York,/ }));
    expect(onPick).toHaveBeenCalledWith("America/New_York");
  });
});
