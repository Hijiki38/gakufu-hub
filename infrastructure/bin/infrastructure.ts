#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();
const stage = process.env.STAGE ?? 'dev';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const auth = new AuthStack(app, `GakufuHub-${stage}-Auth`, {
  env,
  stage,
  stackName: `gakufu-hub-${stage}-auth`,
});

const storage = new StorageStack(app, `GakufuHub-${stage}-Storage`, {
  env,
  stage,
  stackName: `gakufu-hub-${stage}-storage`,
});

new ApiStack(app, `GakufuHub-${stage}-Api`, {
  env,
  stage,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  identityPoolId: auth.identityPool.ref,
  bucket: storage.bucket,
  scoreTable: storage.scoreTable,
  stackName: `gakufu-hub-${stage}-api`,
});
