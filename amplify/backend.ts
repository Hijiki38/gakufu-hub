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
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { apiFunction } from "./functions/api-function/resource";
import { diffFunction } from "./functions/diff-function/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  apiFunction,
  diffFunction,
});

// create a new API stack
const apiStack = backend.createStack("api-stack");

// create a IAM authorizer
const iamAuthorizer = new HttpIamAuthorizer();

// create a User Pool authorizer
const userPoolAuthorizer = new HttpUserPoolAuthorizer(
  "userPoolAuth",
  backend.auth.resources.userPool,
  {
    userPoolClients: [backend.auth.resources.userPoolClient],
  }
);

// create a new HTTP Lambda integration
const httpLambdaIntegration = new HttpLambdaIntegration(
  "LambdaIntegration",
  backend.apiFunction.resources.lambda
);

const diffLambdaIntegration = new HttpLambdaIntegration(
  "DiffLambdaIntegration",
  backend.diffFunction.resources.lambda
);

// create a new HTTP API with IAM as default authorizer
const httpApi = new HttpApi(apiStack, "HttpApi", {
  apiName: "sample-http-api",
  corsPreflight: {
    // Modify the CORS settings below to match your specific requirements
    allowMethods: [
      CorsHttpMethod.GET,
      CorsHttpMethod.POST,
      CorsHttpMethod.PUT,
      CorsHttpMethod.DELETE,
    ],
    // Restrict this to domains you trust
    allowOrigins: ["*"],
    // Specify only the headers you need to allow
    allowHeaders: ["*"],
  },
  createDefaultStage: true,
});

// add routes to the API with a IAM authorizer and different methods
httpApi.addRoutes({
  path: "/items",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.POST, HttpMethod.DELETE],
  integration: httpLambdaIntegration,
  authorizer: iamAuthorizer,
});

// add a proxy resource path to the API
httpApi.addRoutes({
  path: "/items/{proxy+}",
  methods: [HttpMethod.ANY],
  integration: httpLambdaIntegration,
  authorizer: iamAuthorizer,
});

// add the options method to the route
httpApi.addRoutes({
  path: "/items/{proxy+}",
  methods: [HttpMethod.OPTIONS],
  integration: httpLambdaIntegration,
});

httpApi.addRoutes({
  path: "/diff",
  methods: [HttpMethod.POST],
  integration: diffLambdaIntegration,
  // authorizer: iamAuthorizer,
});

httpApi.addRoutes({
  path: "/diff",
  methods: [HttpMethod.OPTIONS],
  integration: diffLambdaIntegration,
});

// add route to the API with a User Pool authorizer
httpApi.addRoutes({
  path: "/cognito-auth-path",
  methods: [HttpMethod.GET],
  integration: httpLambdaIntegration,
  authorizer: userPoolAuthorizer,
});

// create a new IAM policy to allow Invoke access to the API
const apiPolicy = new Policy(apiStack, "ApiPolicy", {
  statements: [
    new PolicyStatement({
      actions: ["execute-api:Invoke"],
      resources: [
        `${httpApi.arnForExecuteApi("*", "/items")}`,
        `${httpApi.arnForExecuteApi("*", "/items/*")}`,
        `${httpApi.arnForExecuteApi("*", "/cognito-auth-path")}`,
        `${httpApi.arnForExecuteApi("*", "/diff")}`,
        `${httpApi.arnForExecuteApi("*", "/diff/*")}`,
      ],
    }),
  ],
});

// attach the policy to the authenticated and unauthenticated IAM roles
backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(apiPolicy);
backend.auth.resources.unauthenticatedUserIamRole.attachInlinePolicy(apiPolicy);

// add outputs to the configuration file
backend.addOutput({
  // storage: {
  //   aws_region: "ap-northeast-1",
  //   bucket_name: "amplify-dqrrljhk7ysty-mai-amplifydataamplifycodege-l1oukil6xiuc",
  // },
  custom: {
    API: {
      [httpApi.httpApiName!]: {
        endpoint: httpApi.url,
        region: Stack.of(httpApi).region,
        apiName: httpApi.httpApiName,
      },
    },
  },
});

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
// defineBackend({
//   auth,
//   data,
// });
