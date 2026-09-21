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
    slidingWindow({
      mode:'LIVE',
      interval:'60s',
      max: 5,
    })
  ],
});
export default aj ;