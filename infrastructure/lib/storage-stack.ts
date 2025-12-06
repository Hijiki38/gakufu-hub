import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  stage: string;
}

// S3 バケットと ScoreMetadata 用 DynamoDB テーブルを構築するスタック。
export class StorageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly scoreTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { stage } = props;

    this.bucket = new s3.Bucket(this, 'ScoreBucket', {
      bucketName: `gakufu-hub-storage-${stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false, // ファイルバージョンはキー規約で管理
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedOrigins: ['*'], // Phase2 では許可を広めに。後でドメイン制限を検討。
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.DELETE, s3.HttpMethods.HEAD],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'AbortIncompleteMultipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });

    this.scoreTable = new dynamodb.Table(this, 'ScoreMetadataTable', {
      tableName: `ScoreMetadata-${stage}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING }, // work#part
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING }, // timestamp
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
    });

    this.scoreTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-UploadedBy',
      partitionKey: { name: 'uploadedBy', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'uploadedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new CfnOutput(this, 'BucketArn', { value: this.bucket.bucketArn });
    new CfnOutput(this, 'ScoreTableName', { value: this.scoreTable.tableName });
    new CfnOutput(this, 'ScoreTableArn', { value: this.scoreTable.tableArn });
  }
}
