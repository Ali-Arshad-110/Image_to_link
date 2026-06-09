import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { s3, bucketName } from "@/lib/s3";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { generateShortId, isRateLimited } from "@/lib/utils";

export async function POST(req: NextRequest) {
  // 1. Rate Limiting Check
  if (isRateLimited(req, 15, 60000)) { // 15 requests per minute limit
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { fileName, fileType, fileSize } = body;

    // Validate inputs
    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: "fileName and fileType are required." },
        { status: 400 }
      );
    }

    // Limit to 10MB (10 * 1024 * 1024 bytes)
    if (fileSize && fileSize > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit." },
        { status: 400 }
      );
    }

    // Verify it is an image type
    if (!fileType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed." },
        { status: 400 }
      );
    }

    // 2. Generate unique 6-character shortId and verify uniqueness
    let shortId = "";
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      shortId = generateShortId(6);
      const existing = await prisma.imageUpload.findUnique({
        where: { shortId },
      });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: "Failed to generate a unique ID. Please try again." },
        { status: 500 }
      );
    }

    // 3. Define S3 properties
    const s3Key = `uploads/${shortId}/${fileName}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    // 4. Create Pre-signed URL
    // S3 PUT pre-signed URL allows direct upload from client to S3
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: fileType,
    });

    // Valid for 2 minutes (120 seconds)
    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 120 });

    // 5. Store metadata in database
    await prisma.imageUpload.create({
      data: {
        shortId,
        fileName,
        fileType,
        s3Key,
        expiresAt,
      },
    });

    // 6. Proactive cleanup sweep: Remove up to 5 expired records and files on-the-fly
    try {
      const expiredUploads = await prisma.imageUpload.findMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
        take: 5,
      });

      for (const expired of expiredUploads) {
        try {
          await s3.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: expired.s3Key,
          }));
        } catch (s3Err: any) {
          console.error(`Quick sweep S3 delete failure for ${expired.s3Key}:`, s3Err);
        }
        try {
          await prisma.imageUpload.delete({
            where: { id: expired.id },
          });
        } catch (dbErr: any) {
          console.error(`Quick sweep DB delete failure for ID ${expired.id}:`, dbErr);
        }
      }
    } catch (sweepErr: any) {
      console.error("Proactive cleanup sweep failed:", sweepErr);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
    const downloadUrl = `${appUrl}/share/${shortId}${ext}`;
    const previewUrl = `${appUrl}/view/${shortId}`;

    return NextResponse.json({
      uploadUrl,
      shortId,
      downloadUrl,
      previewUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Initiate Upload Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// Enable CORS OPTIONS request handling on the upload endpoint for other origins
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
