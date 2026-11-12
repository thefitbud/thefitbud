/**
 * Z11b-1: the shared @fitbud/config rule that bans URLSearchParams#size (Expo's
 * native polyfill lacks it). Lives here because this is the workspace's
 * eslint-rule test suite; the rule itself applies to every package.
 */
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { noUrlSearchParamsSize } from "@fitbud/config/eslint/no-urlsearchparams-size";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const errors = [{ messageId: "size" }];

tester.run("no-urlsearchparams-size", noUrlSearchParamsSize, {
  valid: [
    // Map and Set size are fine, whatever the variable is called.
    "const params = new Map(); params.size;",
    "const searchParams = new Set([1]); if (searchParams.size > 0) {}",
    "function f(params: Map<string, string>) { return params.size; }",
    // The supported way.
    "const params = new URLSearchParams(); const s = params.toString(); s.length;",
    "const url = new URL('https://x.test'); url.searchParams.get('a');",
    // Unrelated objects with a size.
    "const file = { size: 3 }; file.size;",
  ],
  invalid: [
    {
      code: 'const params = new URLSearchParams(); const suffix = params.size > 0 ? `?${params.toString()}` : "";',
      errors,
    },
    { code: "let p = new URLSearchParams('a=1'); if (p['size']) {}", errors },
    { code: "const q: URLSearchParams = build(); q.size;", errors },
    { code: "function suffix(params: URLSearchParams) { return params.size ? '?' : ''; }", errors },
    { code: "const s = (x: URLSearchParams) => x.size;", errors },
    { code: "new URLSearchParams(location.search).size;", errors },
    { code: "new URL(href).searchParams.size;", errors },
  ],
});
