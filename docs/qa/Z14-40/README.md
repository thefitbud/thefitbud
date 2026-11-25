# Z14-40 cold-start steps (timing only, no frames)

1. Sign in as a trainee (for example the demo trainee) and let the app finish loading. This stores the `/me` snapshot.
2. Kill the app and reopen it with the network on. The trainee shell should appear without the short relationships pause. The live list still loads behind it.
3. Repeat as a trainer: the trainer shell opens straight away.
4. Fresh install or just after sign-in on a new phone (no snapshot): the spinner still waits for the live relationships call, as before.
5. Revoke the session on the server, then reopen: the app signs out and shows the sign-in screen, never the shell.
6. End the coaching relationship from the trainer side, then reopen the trainee app: the stored shell may show for a moment, then moves once to the ended screen with no error text.
