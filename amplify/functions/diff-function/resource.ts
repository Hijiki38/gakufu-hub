// import { handler } from './../api-function/handler';
import { execSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineFunction } from "@aws-amplify/backend";
import { DockerImage, Duration } from "aws-cdk-lib";
import { Code, Function, Runtime, Architecture } from "aws-cdk-lib/aws-lambda";

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const diffFunction = defineFunction({
　// オプションで関数の名前を指定できます（デフォルトはディレクトリ名です）
  name: 'diff-function',
  // オプションでハンドラーのパスを指定できます（デフォルトは "./handler.ts" です）
  // entry: './handler.py'
});

// export const diffFunction = defineFunction(
//   (scope) =>
//     new Function(scope, "diff-function", {
//       handler: "handler.lambda_handler", // handler.py の lambda_handler
//       runtime: Runtime.PYTHON_3_9,
//       architecture: Architecture.X86_64,
//       timeout: Duration.seconds(20),
//       code: Code.fromAsset(functionDir, {
//         bundling: {
//           image: DockerImage.fromRegistry("public.ecr.aws/lambda/python:3.9"),
//           local: {
//             tryBundle(outputDir: string) {
//               execSync(
//                 `python3 -m pip install -r ${path.join(functionDir, "requirements.txt")} -t ${outputDir} --platform manylinux2014_x86_64 --only-binary=:all:`
//               );
//               // execSync(`rsync -rLv ${functionDir}/*.py ${outputDir}`);
//               execSync(`cp -r ${functionDir}/* ${path.join(outputDir)}`);
//               return true;
//             },
//           },
//         },
//       }),
//     })
// );