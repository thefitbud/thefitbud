import { describe, expect, it } from "vitest";
import {
  popOverlay,
  pushOverlay,
  replaceOverlay,
  resetOverlays,
} from "./traineeOverlayStack";

type O = { screen: string; assignmentId?: string };
const account: O = { screen: "account" };
const password: O = { screen: "password" };
const privacy: O = { screen: "privacy" };
const del: O = { screen: "delete_account" };

describe("trainee overlay stack", () => {
  it("push: Account -> Password stacks on top, Back returns to Account", () => {
    const stack = pushOverlay(pushOverlay<O>([], account), password);
    expect(stack).toEqual([account, password]);
    expect(popOverlay(stack)).toEqual([account]);
  });

  it("pop: the last screen leaves an empty stack (the tab shows); empty stays empty", () => {
    expect(popOverlay([account])).toEqual([]);
    expect(popOverlay<O>([])).toEqual([]);
  });

  it("Privacy -> Delete account: Back goes to Privacy, then Account", () => {
    const stack = [account, privacy, del];
    expect(popOverlay(stack)).toEqual([account, privacy]);
    expect(popOverlay(popOverlay(stack))).toEqual([account]);
  });

  it("a double tap does not push the same screen twice", () => {
    const once = pushOverlay<O>([], account);
    expect(pushOverlay(once, account)).toBe(once);
    const meal = [{ screen: "meal", assignmentId: "a" }];
    expect(pushOverlay(meal, { screen: "meal", assignmentId: "b" })).toHaveLength(2);
  });

  it("replace swaps the top and keeps what is below; on empty it pushes", () => {
    expect(replaceOverlay([account, password], privacy)).toEqual([account, privacy]);
    expect(replaceOverlay<O>([], account)).toEqual([account]);
  });

  it("reset starts again with one screen (deep link) or nothing", () => {
    expect(resetOverlays(account)).toEqual([account]);
    expect(resetOverlays()).toEqual([]);
  });

  it("never mutates its input", () => {
    const stack: readonly O[] = Object.freeze([account, password]);
    pushOverlay(stack, privacy);
    popOverlay(stack);
    replaceOverlay(stack, privacy);
    expect(stack).toEqual([account, password]);
  });
});
