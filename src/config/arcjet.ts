import arcjet ,{shield,detectBot,slidingWindow}from "@arcjet/node";

if(!process.env.ARCJET_KEY && process.env.NODE_ENV !== 'test'){

  throw new Error('ARCJECT_KEY env is reqired');
}


const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE", 
      allow: [
        "CATEGORY:SEARCH_ENGINE", 
        "CATEGORY:PREVIEW", 
      ],
    }),
    // This base limit applies to every request on top of the per-role limit
    // added dynamically in middleware/security.ts. 5/min was far too strict
    // for normal interactive use (a list page load, a filter change, and the
    // session check that fires on every route change already add up to more
    // than that) -- raised to a generous baseline that's still meaningful
    // abuse protection, since the per-role rule is the more precise limit.
    slidingWindow({
      mode:'LIVE',
      interval:'60s',
      max: 60,
    })
  ],
});
export default aj ;