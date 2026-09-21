// apminsight instruments Node's module loader, so it must run before
// express (and everything that requires it) is loaded. It's only relevant
// to this long-running local/persistent-server entrypoint -- src/app.ts
// (also used by the Netlify Function) stays free of it, since an APM agent
// built around a background reporting loop doesn't fit a function that gets
// frozen between requests, and its native binary isn't available there anyway.
import AgentAPI from "apminsight";
AgentAPI.config();

const { default: app } = await import("./app");

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
