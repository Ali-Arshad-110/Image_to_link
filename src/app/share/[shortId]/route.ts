import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { s3, bucketName } from "@/lib/s3";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params;

  // Strip file extension suffix if present (e.g., "BPHE3g.png" -> "BPHE3g")
  const cleanShortId = shortId.includes(".") ? shortId.split(".")[0] : shortId;

  try {
    // 1. Fetch metadata from DB
    const upload = await prisma.imageUpload.findUnique({
      where: { shortId: cleanShortId },
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
      // 1. Delete from S3 storage
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: upload.s3Key,
        });
        await s3.send(deleteCommand);
      } catch (err: any) {
        console.error(`S3 key delete failed on expired link request: ${upload.s3Key}`, err);
      }

      // 2. Delete from DB
      try {
        await prisma.imageUpload.delete({
          where: { id: upload.id },
        });
      } catch (err: any) {
        console.error(`DB row delete failed on expired link request: ${upload.id}`, err);
      }

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
    const headers: Record<string, string> = {
      "Content-Type": upload.fileType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Range",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Disposition": "inline",
    };

    if (s3Response.ContentLength !== undefined) {
      headers["Content-Length"] = String(s3Response.ContentLength);
    }

    return new Response(s3Response.Body as any, {
      status: 200,
      headers,
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
