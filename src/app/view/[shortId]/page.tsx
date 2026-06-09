import prisma from "@/lib/db";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PreviewPageProps = {
  params: Promise<{
    shortId: string;
  }>;
};

function getShortId(value: string) {
  return value.includes(".") ? value.split(".")[0] : value;
}

function getExtension(fileName: string) {
  return fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { shortId } = await params;
  const cleanShortId = getShortId(shortId);

  const upload = await prisma.imageUpload.findUnique({
    where: { shortId: cleanShortId },
  });

  if (!upload) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h1 className="text-xl font-semibold">Image not found</h1>
          <p className="mt-2 text-sm text-zinc-400">
            This link is invalid or the upload has already been deleted.
          </p>
        </div>
      </main>
    );
  }

  const rawImageUrl = `/share/${upload.shortId}${getExtension(upload.fileName)}`;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-2 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold">Image preview</h1>
          <p className="text-sm text-zinc-400">
            Browser-visible preview page. Use the raw image URL for OpenAI API image inputs.
          </p>
        </header>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <Image
            src={rawImageUrl}
            alt={upload.fileName}
            width={1600}
            height={1200}
            unoptimized
            className="mx-auto max-h-[78vh] w-auto max-w-full rounded-md object-contain"
          />
        </section>

        <dl className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Raw image URL</dt>
            <dd className="mt-1 break-all font-mono text-zinc-200">{rawImageUrl}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Content type</dt>
            <dd className="mt-1 font-mono text-zinc-200">{upload.fileType}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Expires</dt>
            <dd className="mt-1 font-mono text-zinc-200">{upload.expiresAt.toISOString()}</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
