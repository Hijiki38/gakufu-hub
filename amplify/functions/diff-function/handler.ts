import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

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
  // 一時的にダミーPNG画像を生成（テスト用）
  console.log("Creating dummy PNG image for testing");
  
  const width = 600;
  const height = 800;
  const png = new PNG({ width, height });
  
  // ダミーの画像データを生成（白い背景）
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 255;     // Red
      png.data[idx + 1] = 255; // Green
      png.data[idx + 2] = 255; // Blue
      png.data[idx + 3] = 255; // Alpha
    }
  }
  
  return PNG.sync.write(png);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log("diff event", event);
  
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const repo: string = body.repo;
    if (!repo || !BUCKET_NAME) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
        body: JSON.stringify({ message: "repo or bucket missing" }),
      };
    }

    console.log("Processing diff for repo:", repo, "bucket:", BUCKET_NAME);

    const prefix = `data/${repo}/`;
    const listRes = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix })
    );
    
    console.log("S3 list result:", listRes.Contents?.length || 0, "files");
    
    const files = (listRes.Contents || [])
      .filter((f) => f.Key?.endsWith(".pdf"))
      .sort(
        (a, b) =>
          (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
      );

    console.log("PDF files found:", files.length);

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

    console.log("Starting diff processing...");

    const [latest, previous] = files.slice(0, 2);
    console.log("Latest file:", latest.Key);
    console.log("Previous file:", previous.Key);

    const obj1 = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: latest.Key! })
    );
    const obj2 = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: previous.Key! })
    );

    console.log("Downloaded PDF files from S3");

    const buf1 = await streamToBuffer(obj1.Body as any);
    const buf2 = await streamToBuffer(obj2.Body as any);

    console.log("Converted streams to buffers");

    const img1 = PNG.sync.read(await pdfToPng(buf1));
    const img2 = PNG.sync.read(await pdfToPng(buf2));
    const diff = new PNG({ width: img1.width, height: img1.height });

    console.log("Generated PNG images from PDFs");

    pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, {
      threshold: 0.1,
    });

    console.log("Calculated diff using pixelmatch");

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

    console.log("Uploaded diff image to S3:", diffKey);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
      body: JSON.stringify({ diffKey }),
    };
  } catch (error) {
    console.error("Lambda error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
      body: JSON.stringify({ 
        message: "Internal Server Error",
        error: error instanceof Error ? error.message : String(error)
      }),
    };
  }
};
