/**
 * Shared mobile Text — always Satoshi. Screens should import from here
 * (or `@fitbud/ui-mobile` `FitText`) instead of `react-native` so style
 * objects that omit fontFamily cannot fall back to -apple-system.
 */
export { FitText as Text } from "@fitbud/ui-mobile";
