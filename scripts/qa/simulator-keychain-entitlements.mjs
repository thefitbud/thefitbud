/**
 * Entitlements for an ad-hoc-signed iOS simulator app (CU25).
 *
 * `build-ios-sim.sh` compiles with CODE_SIGNING_ALLOWED=NO, because the runner
 * has no development certificate and the app's push and App Group entitlements
 * would otherwise demand one. An unsigned simulator binary has neither
 * `application-identifier` nor `keychain-access-groups`. SecureStore then fails
 * every read with errSecMissingEntitlement (-34018), and the app treats that
 * as "offline" (`sessionRestore.ts`) so Maestro never sees the auth screen.
 *
 * An ad-hoc signature (`codesign -s -`) needs no certificate. These two keys
 * are what that signature has to carry: the identifier is the default keychain
 * access group, and the access-group array is the same id with no team prefix
 * (an ad-hoc signature has none). No other entitlement is added. The unsigned
 * build already shipped without push and App Group entitlements, and the suite
 * does not exercise them.
 */

import { pathToFileURL } from "node:url";

const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

export function keychainEntitlementsPlist(bundleId) {
  if (typeof bundleId !== "string" || !BUNDLE_ID.test(bundleId)) {
    throw new Error("bundle id must be a reverse-DNS identifier");
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>application-identifier</key>
	<string>${bundleId}</string>
	<key>keychain-access-groups</key>
	<array>
		<string>${bundleId}</string>
	</array>
</dict>
</plist>
`;
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
  const bundleId = process.argv[2];
  if (!bundleId) {
    process.stderr.write("usage: simulator-keychain-entitlements.mjs <bundle-id>\n");
    process.exit(1);
  }
  try {
    process.stdout.write(keychainEntitlementsPlist(bundleId));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "invalid bundle id"}\n`);
    process.exit(1);
  }
}
