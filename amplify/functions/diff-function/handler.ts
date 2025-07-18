import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { getDocument } from "pdfjs-dist";
import { createCanvas } from "canvas";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME || "";

const streamToBuffer = async (stream: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
};

async function pdfToPng(buffer: Buffer): Promise<Buffer> {
  const loadingTask = getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context as any, viewport }).promise;
  return canvas.toBuffer("image/png");
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log("diff event", event);
  const body = event.body ? JSON.parse(event.body) : {};
  const repo: string = body.repo;
  if (!repo || !BUCKET_NAME) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "repo or bucket missing" }),
    };
  }

  const prefix = `data/${repo}/`;
  const listRes = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix })
  );
  const files = (listRes.Contents || [])
    .filter((f) => f.Key?.endsWith(".pdf"))
    .sort(
      (a, b) =>
        (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
    );

  if (files.length < 2) {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
      body: JSON.stringify({ message: "not enough pdf files" }),
    };
  }

  const [latest, previous] = files.slice(0, 2);
  const obj1 = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: latest.Key! })
  );
  const obj2 = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: previous.Key! })
  );

  const buf1 = await streamToBuffer(obj1.Body as any);
  const buf2 = await streamToBuffer(obj2.Body as any);

  const img1 = PNG.sync.read(await pdfToPng(buf1));
  const img2 = PNG.sync.read(await pdfToPng(buf2));
  const diff = new PNG({ width: img1.width, height: img1.height });

  pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, {
    threshold: 0.1,
  });

  const diffBuffer = PNG.sync.write(diff);
  const diffKey = `${prefix}diffs/${Date.now()}.png`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: diffKey,
      Body: diffBuffer,
      ContentType: "image/png",
    })
  );

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
    body: JSON.stringify({ diffKey }),
  };
};
