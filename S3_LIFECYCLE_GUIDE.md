# AWS S3 Configuration: Lifecycle Policy & CORS Settings

To support direct client-to-cloud uploads and automated self-destruction, your S3 bucket must be configured with both a **CORS Policy** (to allow browser-level PUT requests) and a **Lifecycle Policy** (to clean up storage at the hardware level).

---

## 1. S3 CORS Configuration (CRITICAL)

Because the frontend uses pre-signed URLs to upload files *directly* from the client browser to your S3 bucket, you must configure CORS on your S3 bucket. Without this, browsers will block the PUT request due to cross-origin security restrictions.

### Policy Document (JSON)
Apply this JSON in your AWS S3 Bucket settings under the **Permissions** tab -> **Cross-origin resource sharing (CORS)**:

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "PUT",
      "GET"
    ],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-production-app.vercel.app"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

> [!NOTE]
> For early development or a generic endpoint, you can set `"AllowedOrigins": ["*"]`, but restrict it to your specific domain in production for tighter security.

---

## 2. AWS S3 Lifecycle Policy (Dual-Layer TTL)

AWS S3 native lifecycle policies run in daily batches and only support expiration intervals defined in integer **Days** (minimum 1 day). 

To ensure files are deleted from S3:
1. **Immediate API Expiration:** Our `/share/[shortId]` streaming endpoint immediately returns `404` or `410` after exactly 1 hour by checking database metadata.
2. **S3 Native Lifecycle Policy (1-day Sweep):** Deletes S3 binaries after 1 day to ensure storage costs are kept minimal.
3. **Active Serverless Cron (Hourly/10-min Sweep):** The endpoint `/api/cron/cleanup` can be scheduled to run every 10 minutes to delete expired items from both S3 and the database.

### Native S3 Lifecycle Rule JSON
Save the following as `lifecycle-policy.json` and upload it to your S3 bucket (or configure it in **Management** tab -> **Lifecycle rules**):

```json
{
  "Rules": [
    {
      "ID": "DeleteTemporaryUploadsAfterOneDay",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "uploads/"
      },
      "Expiration": {
        "Days": 1
      }
    }
  ]
}
```

### Applying via AWS CLI
```bash
aws s3api put-bucket-lifecycle-configuration \
    --bucket your-s3-bucket-name \
    --lifecycle-configuration file://lifecycle-policy.json
```

---

## 3. Active Serverless Cron Configuration (Vercel)

To run the active sub-day cleanup, configure a Cron job on Vercel. 

Create a `vercel.json` in the root of your project:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

And configure your environment variables:
- `CRON_SECRET`: Generate a random secure token.
- Add the authorization header in your cron requests (Vercel automatically attaches the `Authorization: Bearer <CRON_SECRET>` header to cron requests).
