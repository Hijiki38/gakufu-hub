// import type { APIGatewayProxyHandler } from "aws-lambda";

// export const handler: APIGatewayProxyHandler = async (event) => {
//   console.log("event", event);
//   return {
//     statusCode: 200,
//     // Modify the CORS settings below to match your specific requirements
//     headers: {
//       "Access-Control-Allow-Origin": "*", // Restrict this to domains you trust
//       "Access-Control-Allow-Headers": "*", // Specify only the headers you need to allow
//     },
//     body: JSON.stringify("Hello from myFunction!!!!"),
//   };
// };


// lambda_node/handler.ts
// Invokes Python Lambda for PDF diff generation
// Supports both legacy (repo) and new (work/part) formats
// Expected body: { work, part, key } or { repo, key }
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const client = new LambdaClient({});

export const handler = async (event: any) => {
  const payload = JSON.stringify({ input: JSON.parse(event.body ?? '{}') });
  const resp = await client.send(new InvokeCommand({
    FunctionName: process.env.PY_FN_NAME!,
    Payload: new TextEncoder().encode(payload),
  }));

  const raw = resp.Payload ? new TextDecoder().decode(resp.Payload) : '{}';
  const pyResult = JSON.parse(raw); // Python側が JSON を返す前提

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body: JSON.stringify(pyResult),
  };
};