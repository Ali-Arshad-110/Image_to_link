import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { s3, bucketName } from "@/lib/s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cleanup Cron Route: GET /api/cron/cleanup
 * Trigger this endpoint via a cron scheduler (e.g., Vercel Crons or GitHub Actions)
 * to remove expired S3 objects and DB metadata.
 */
export async function GET(req: NextRequest) {
  // Check authorization (Vercel Cron sets the CRON_SECRET or authorization header)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized execution block." },
      { status: 401 }
    );
  }

  try {
    const now = new Date();
    
    // 1. Query all uploads whose expiration time is in the past
    const expiredUploads = await prisma.imageUpload.findMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
      take: 100, // Process in batches to stay within serverless execution limits
    });

    if (expiredUploads.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No expired objects found. Pipeline clean." 
      });
    }

    const deletions = [];

    // 2. Loop through and delete from both S3 and the database
    for (const upload of expiredUploads) {
      try {
        // Delete the binary from S3
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: upload.s3Key,
        });
        await s3.send(deleteCommand);
        
        // Delete the metadata row from DB
        await prisma.imageUpload.delete({
          where: { id: upload.id },
        });

        deletions.push({ shortId: upload.shortId, status: "SUCCESS" });
      } catch (err: any) {
        console.error(`Cron fail on S3 Key delete: ${upload.s3Key}`, err);
        
        // If the S3 object is already gone (e.g. deleted manually or by S3 lifecycle), 
        // still remove the database metadata row to keep state aligned.
        if (err.name === "NoSuchKey") {
          await prisma.imageUpload.delete({
            where: { id: upload.id },
          });
          deletions.push({ shortId: upload.shortId, status: "DB_ONLY_CLEANED_S3_ABSENT" });
        } else {
          deletions.push({ shortId: upload.shortId, status: "FAILED", error: err.message });
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: expiredUploads.length,
      details: deletions,
    });
  } catch (error: any) {
    console.error("Pipeline Cleanup Cron Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error in cleanup pipeline." },
      { status: 500 }
    );
  }
}
