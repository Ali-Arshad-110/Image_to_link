import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { s3, bucketName } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params;

  try {
    // 1. Fetch metadata from DB
    const upload = await prisma.imageUpload.findUnique({
      where: { shortId },
    });

    // 2. Validate existence and expiration
    if (!upload) {
      return new Response("Image not found", { 
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    const now = new Date();
    if (now > upload.expiresAt) {
      return new Response("Image has expired and self-destructed", { 
        status: 410,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    // 3. Fetch object from S3
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: upload.s3Key,
    });

    const s3Response = await s3.send(getCommand);

    if (!s3Response.Body) {
      return new Response("Image content empty", { 
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    // 4. Return raw streaming response with CORS and cache control
    return new Response(s3Response.Body as any, {
      status: 200,
      headers: {
        "Content-Type": upload.fileType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Disposition": "inline",
      },
    });
  } catch (error: any) {
    console.error(`Error streaming image for shortId: ${shortId}`, error);
    
    // If S3 key is not found (e.g. deleted by lifecycle policy) return 404
    if (error.name === "NoSuchKey") {
      return new Response("Image not found on storage", { 
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
    
    return new Response("Internal Server Error", { 
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
    },
  });
}
