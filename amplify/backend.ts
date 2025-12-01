// import { defineBackend } from '@aws-amplify/backend';
// import { auth } from './auth/resource';
// import { data } from './data/resource';
// import { storage } from './storage/resource';
// import { Stack } from "aws-cdk-lib";
// import {
//   CorsHttpMethod,
//   HttpApi,
//   HttpMethod,
// } from "aws-cdk-lib/aws-apigatewayv2";
// import {
//   HttpIamAuthorizer,
//   HttpUserPoolAuthorizer,
// } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
// import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
// import { aws_lambda as lambda, aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";
// import { DockerImageFunction, DockerImageCode } from "aws-cdk-lib/aws-lambda"; 
// import { Duration } from "aws-cdk-lib";
// // import * as path from "node:path";
// import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
// // import { apiFunction } from "./functions/api-function/resource";
// import { diffFunction } from "./functions/diff-function/resource";
// import { helloAmplify } from './functions/test-function/resource'; 

// const backend = defineBackend({
//   auth,
//   data,
//   storage,
//   // apiFunction,
//   diffFunction,
//   helloAmplify,
// });

// // Grant storage permissions to the diff function
// backend.diffFunction.addEnvironment("BUCKET_NAME", backend.storage.resources.bucket.bucketName);
// backend.storage.resources.bucket.grantReadWrite(backend.diffFunction.resources.lambda);

// // create a new API stack
// const apiStack = backend.createStack("api-stack");

// // create a IAM authorizer
// const iamAuthorizer = new HttpIamAuthorizer();

// // create a User Pool authorizer
// const userPoolAuthorizer = new HttpUserPoolAuthorizer(
//   "userPoolAuth",
//   backend.auth.resources.userPool,
//   {
//     userPoolClients: [backend.auth.resources.userPoolClient],
//   }
// );

// const diffHttpLambdaIntegration = new HttpLambdaIntegration(
//   "DiffLambdaIntegration",
//   backend.diffFunction.resources.lambda
// );

// const pyFunc = new DockerImageFunction(backend.stack, 'PyFunc', {
//   functionName: 'diff-py-function',
//   code: DockerImageCode.fromImageAsset("./lambda_py"),
//   memorySize: 1024,
//   timeout: Duration.seconds(30),
//   architecture: lambda.Architecture.X86_64,
// });

// const diffpyHttpLambdaIntegration = new HttpLambdaIntegration(
//   "DiffPyLambdaIntegration",
//   pyFunc
// );


// // create a new HTTP API v2 for diffApi
// const diffHttpApi = new HttpApi(apiStack, "diffApiv2", {
//   apiName: "diffApiv2",
//   corsPreflight: {
//     allowMethods: [
//       CorsHttpMethod.GET,
//       CorsHttpMethod.POST,
//       CorsHttpMethod.PUT,
//       CorsHttpMethod.DELETE,
//       CorsHttpMethod.OPTIONS,
//     ],
//     allowOrigins: ["*"],
//     allowHeaders: ["*"],
//   },
//   createDefaultStage: true,
// });


// diffHttpApi.addRoutes({
//   path: "/diff",
//   methods: [HttpMethod.GET, HttpMethod.POST],
//   integration: diffHttpLambdaIntegration,
//   authorizer: iamAuthorizer,
// });

// const apiPolicy = new Policy(apiStack, "ApiPolicy", {
//   statements: [
//     new PolicyStatement({
//       actions: ["execute-api:Invoke"],
//       resources: [
//         `${diffHttpApi.arnForExecuteApi("*", "/diff")}`,
//         `${diffHttpApi.arnForExecuteApi("*", "/diff/*")}`,

//       ],
//     }),
//   ],
// });


// // attach the policy to the authenticated and unauthenticated IAM roles
// backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(apiPolicy);
// backend.auth.resources.unauthenticatedUserIamRole.attachInlinePolicy(apiPolicy);

// // backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(testApiPolicy);
// // backend.auth.resources.unauthenticatedUserIamRole.attachInlinePolicy(testApiPolicy);

// // add outputs to the configuration file
// backend.addOutput({
//   // storage: {
//   //   aws_region: "ap-northeast-1",
//   //   bucket_name: "amplify-dqrrljhk7ysty-mai-amplifydataamplifycodege-l1oukil6xiuc",
//   // },
//   custom: {
//     API: {
//       [diffHttpApi.httpApiName!]: {
//         endpoint: diffHttpApi.url,
//         region: Stack.of(diffHttpApi).region,
//         apiName: diffHttpApi.httpApiName,
//       },
//       // [testApi.httpApiName!]: {
//       //   endpoint: testApi.url,
//       //   region: Stack.of(testApi).region,
//       //   apiName: testApi.httpApiName,
//       // },
//     },
//   },
// }); 

// /**
//  * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
//  */
// // defineBackend({
// //   auth,
// //   data,
// // });


import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { Stack } from "aws-cdk-lib";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import {
  HttpIamAuthorizer,
  HttpUserPoolAuthorizer,
} from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { DockerImageFunction, DockerImageCode } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";

// 既存の関数リソース
import { diffFunction } from "./functions/diff-function/resource";
import { helloAmplify } from './functions/test-function/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  diffFunction,
  helloAmplify,
});

// === 既存: diffFunction に S3 権限 ===
backend.diffFunction.addEnvironment("BUCKET_NAME", backend.storage.resources.bucket.bucketName);
backend.storage.resources.bucket.grantReadWrite(backend.diffFunction.resources.lambda);

// === 追加: Python コンテナ Lambda を作成（HTTPに直結しない） ===
const pyFunc = new DockerImageFunction(backend.stack, 'PyFunc', {
  functionName: 'diff-py-function',
  code: DockerImageCode.fromImageAsset("./lambda_py"),
  memorySize: 1024,
  timeout: Duration.seconds(30),
  architecture: lambda.Architecture.X86_64,
  environment: {
    // Python 側で必要な環境変数があればここに
    BUCKET_NAME: backend.storage.resources.bucket.bucketName,
  },
});

// Python 側が S3 を触るなら権限付与
backend.storage.resources.bucket.grantReadWrite(pyFunc);

// === 重要: Node(diffFunction) → Python(pyFunc) を invoke できるようにする ===
pyFunc.grantInvoke(backend.diffFunction.resources.lambda);
// Node ハンドラで使うため、Python関数名を環境変数で注入
backend.diffFunction.addEnvironment("PY_FN_NAME", pyFunc.functionName);

// === HTTP API スタック／認可設定は現状維持（NodeをHTTP正面に立てる） ===
const apiStack = backend.createStack("api-stack");
const iamAuthorizer = new HttpIamAuthorizer();

const userPoolAuthorizer = new HttpUserPoolAuthorizer(
  "userPoolAuth",
  backend.auth.resources.userPool,
  { userPoolClients: [backend.auth.resources.userPoolClient] }
);

// 既存 Node ランタイムの Lambda を HTTP に統合
const diffHttpLambdaIntegration = new HttpLambdaIntegration(
  "DiffLambdaIntegration",
  backend.diffFunction.resources.lambda
);

// ※ ここでは Python を HTTP に直結しないので diffpyHttpLambdaIntegration は不要
// const diffpyHttpLambdaIntegration = new HttpLambdaIntegration("DiffPyLambdaIntegration", pyFunc);

const diffHttpApi = new HttpApi(apiStack, "diffApiv2", {
  apiName: "diffApiv2",
  corsPreflight: {
    allowMethods: [
      CorsHttpMethod.GET,
      CorsHttpMethod.POST,
      CorsHttpMethod.PUT,
      CorsHttpMethod.DELETE,
      CorsHttpMethod.OPTIONS,
    ],
    allowOrigins: ["*"],
    allowHeaders: ["*"],
  },
  createDefaultStage: true,
});

// ルートは Node 関数に向けたまま（Node が Python を invoke）
diffHttpApi.addRoutes({
  path: "/diff",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration: diffHttpLambdaIntegration,
  authorizer: iamAuthorizer,
});

const apiPolicy = new Policy(apiStack, "ApiPolicy", {
  statements: [
    new PolicyStatement({
      actions: ["execute-api:Invoke"],
      resources: [
        `${diffHttpApi.arnForExecuteApi("*", "/diff")}`,
        `${diffHttpApi.arnForExecuteApi("*", "/diff/*")}`,
      ],
    }),
  ],
});

// 認証/非認証ロールにAPI呼び出し権限を付与
backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(apiPolicy);
backend.auth.resources.unauthenticatedUserIamRole.attachInlinePolicy(apiPolicy);

// 出力 - REST API endpoint を amplify_outputs.json に追加
backend.addOutput({
  custom: {
    API: {
      diffApiv2: {
        endpoint: diffHttpApi.url,
        region: Stack.of(diffHttpApi).region,
      },
    },
  },
});

