// Z12-38: the coach shares a note with the trainee through the local seeded API, so
// the trainee's Today shows the coach-note in-app banner (TR-06h). Runs on the
// Maestro host, where the device gate's local API listens on 127.0.0.1:8787 (never
// staging). The password is the public local demo password the harness passes in.
//
// Env: API, TRAINER_EMAIL, TRAINEE_EMAIL, PASSWORD, NOTE.

function login(email, role) {
  var res = http.post(API + "/auth/login", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error("login failed for the " + role + ": " + res.status);
  return json(res.body).data.token;
}

var traineeToken = login(TRAINEE_EMAIL, "trainee");
var rels = http.get(API + "/relationships", {
  headers: { Authorization: "Bearer " + traineeToken, "x-fitbud-role": "trainee" },
});
if (rels.status !== 200) throw new Error("relationships failed: " + rels.status);
var relationshipId = json(rels.body).data.items[0].id;

var trainerToken = login(TRAINER_EMAIL, "trainer");
var note = http.post(API + "/checkins/relationships/" + relationshipId + "/notes", {
  headers: {
    Authorization: "Bearer " + trainerToken,
    "x-fitbud-role": "trainer",
    "Content-Type": "application/json",
    "Idempotency-Key": "z12-38-" + Date.now(),
  },
  body: JSON.stringify({ body: NOTE, visibility: "client" }),
});
if (note.status !== 200 && note.status !== 201) throw new Error("note share failed: " + note.status);
output.noteShared = "yes";
