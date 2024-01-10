import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./app";
async function check() {
  const server=createApp().listen(0,"127.0.0.1");await once(server,"listening");
  const address=server.address();if(!address || typeof address === "string") throw new Error("Missing address");
  const url=`http://127.0.0.1:${address.port}`;
  try {
    assert.deepEqual(await (await fetch(url)).json(),{data:"Hello World"});
    let response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:"Synthetic revision"})});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:"Synthetic revision"});
    for(const data of [null,42,{},"x".repeat(4097)]) {
      response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data})});assert.equal(response.status,400);
    }
    assert.deepEqual(await (await fetch(url)).json(),{data:"Synthetic revision"});
    response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:"x".repeat(20000)})});assert.equal(response.status,413);
    const isolated=createApp().listen(0,"127.0.0.1");await once(isolated,"listening");
    try { const a=isolated.address();if(!a || typeof a === "string") throw new Error();assert.deepEqual(await(await fetch(`http://127.0.0.1:${a.port}`)).json(),{data:"Hello World"}); } finally { isolated.close(); }
    console.log("Passed: initial read, write/readback, four invalid payloads, unchanged state, body bound and isolated app state");
  } finally { server.close(); }
}
check().catch(error=>{console.error(error);process.exitCode=1;});
