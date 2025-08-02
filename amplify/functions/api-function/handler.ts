import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getDocument } from "pdfjs-dist";
import { createCanvas } from "canvas";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { Readable } from "stream";

const s3 = new S3Client({});
const BUCKET = process.env.DIFF_BUCKET as string;

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

const renderFirstPage = async (pdf: Uint8Array) => {
  const loadingTask = getDocument({ data: pdf });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx as any, viewport }).promise;
  return canvas;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log("event", event);

  if (event.rawPath === "/diff" && event.requestContext.http.method === "POST") {
    const { oldKey, newKey } = JSON.parse(event.body || "{}");

    const oldRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: oldKey }));
    const newRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: newKey }));

    const oldPdf = await streamToBuffer(oldRes.Body as Readable);
    const newPdf = await streamToBuffer(newRes.Body as Readable);

    const oldCanvas = await renderFirstPage(oldPdf);
    const newCanvas = await renderFirstPage(newPdf);

    const width = oldCanvas.width;
    const height = oldCanvas.height;
    const diffPng = new PNG({ width, height });

    const oldImg = PNG.sync.read(oldCanvas.toBuffer());
    const newImg = PNG.sync.read(newCanvas.toBuffer());

    pixelmatch(oldImg.data, newImg.data, diffPng.data, width, height);

    const diffBuffer = PNG.sync.write(diffPng);
    const diffKey = `diffs/${Date.now()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
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
  }

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
    body: JSON.stringify("Hello from api-function!"),
  };
};