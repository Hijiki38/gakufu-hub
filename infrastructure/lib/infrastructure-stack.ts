import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// Phase0 では空のスタックを作成し、後続フェーズで Auth/Storage/API スタックを追加する。
export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  }
}
