# Z14-47 visual check

Frame: `docs/design/v3/png/trainee/TR-03-intake-form.png`.

Captured the same way as Z14-46: `expo export --platform web` (react-native-web) driven by Playwright (system Chrome, device scale 2, light) against the local API on the demo seed, signed in as `vikram.onboarding@demo.fitbud.test`. iOS 393x852 (`ios-light-*`) and Android 412x915 (`android-light-*`), step 1 and step 2 (last).

What changed on screen: the long-text answer boxes sit directly under their headings, with no empty label band above. Everything else matches Z14-46.

Limits: web rendering, not native. The sleep placeholder labels, the disabled close button during a save and Android hardware back are covered by tests and need the device run.
