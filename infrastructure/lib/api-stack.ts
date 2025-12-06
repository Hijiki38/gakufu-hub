import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  stage: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  identityPoolId: string;
  bucket: s3.Bucket;
  scoreTable: dynamodb.Table;
}

// HTTP API + Lambda 群（storage/diff）を構築するスタック。Phase3 ではプレースホルダの Lambda を用意し、後続で実装を差し替える。
export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stage, userPool, userPoolClient, identityPoolId, bucket, scoreTable } = props;

    const commonEnv = {
      STAGE: stage,
      BUCKET_NAME: bucket.bucketName,
      SCORE_TABLE_NAME: scoreTable.tableName,
      IDENTITY_POOL_ID: identityPoolId,
      REGION: this.region,
    };

    const storageFn = new lambda.Function(this, 'StorageOperationsFn', {
      functionName: `gakufu-hub-${stage}-storage-ops`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromInline('exports.handler=async()=>({statusCode:200,body:\\"ok\\"});'),
      environment: commonEnv,
    });

    const diffOrchestratorFn = new lambda.Function(this, 'DiffOrchestratorFn', {
      functionName: `gakufu-hub-${stage}-diff-orchestrator`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.seconds(10),
      code: lambda.Code.fromInline('exports.handler=async()=>({statusCode:200,body:\\"diff queued\\"});'),
      environment: commonEnv,
    });

    const pdfDiffProcessorFn = new lambda.Function(this, 'PdfDiffProcessorFn', {
      functionName: `gakufu-hub-${stage}-pdf-diff-processor`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      timeout: Duration.seconds(15),
      code: lambda.Code.fromInline('def handler(event, context):\n    return {"statusCode": 200, "body": "pdf diff"}\n'),
      environment: commonEnv,
    });

    bucket.grantReadWrite(storageFn);
    bucket.grantReadWrite(diffOrchestratorFn);
    bucket.grantReadWrite(pdfDiffProcessorFn);
    scoreTable.grantReadWriteData(storageFn);
    scoreTable.grantReadWriteData(diffOrchestratorFn);
    scoreTable.grantReadWriteData(pdfDiffProcessorFn);

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `gakufu-hub-${stage}-api`,
    });

    const cognitoAuthorizer = new authorizers.HttpUserPoolAuthorizer('HttpCognitoAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
      identitySource: ['$request.header.Authorization'],
    });

    const storageIntegration = new integrations.HttpLambdaIntegration('StorageIntegration', storageFn);
    const diffIntegration = new integrations.HttpLambdaIntegration('DiffIntegration', diffOrchestratorFn);

    httpApi.addRoutes({
      path: '/storage/presigned-upload',
      methods: [apigwv2.HttpMethod.POST],
      integration: storageIntegration,
      authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/storage/presigned-download',
      methods: [apigwv2.HttpMethod.POST],
      integration: storageIntegration,
      authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/storage/list',
      methods: [apigwv2.HttpMethod.GET],
      integration: storageIntegration,
      authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/storage/delete',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: storageIntegration,
      authorizer: cognitoAuthorizer,
    });
    httpApi.addRoutes({
      path: '/diff/generate',
      methods: [apigwv2.HttpMethod.POST],
      integration: diffIntegration,
      authorizer: cognitoAuthorizer,
    });

    new CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'StorageFunctionName', { value: storageFn.functionName });
    new CfnOutput(this, 'DiffOrchestratorFunctionName', { value: diffOrchestratorFn.functionName });
    new CfnOutput(this, 'PdfDiffProcessorFunctionName', { value: pdfDiffProcessorFn.functionName });
  }
}
