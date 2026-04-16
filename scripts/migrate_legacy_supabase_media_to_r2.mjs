const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zogdcuapmnbltdvqsrga.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_KEY || 'sb_publishable_KRRnxuRIWdlgHbn_g65dfQ_Mzzg5Vjl';
const R2_WORKER_URL = (process.env.VITE_R2_WORKER_URL || 'https://lior-media.joinlior.workers.dev').replace(/\/$/, '');
const R2_UPLOAD_KEY = process.env.VITE_R2_UPLOAD_KEY || 'b2eea11b66e49485e673fe99a42655fafae5adb102857c4b';
const SOURCE_BUCKET = process.env.SOURCE_BUCKET || 'tulika-media';
const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_SOURCE = process.argv.includes('--delete-source');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !R2_WORKER_URL || !R2_UPLOAD_KEY) {
  console.error('Missing required Supabase or R2 configuration.');
  process.exit(1);
}

const authHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function listPrefix(prefix = '') {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${SOURCE_BUCKET}`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 100, offset: 0, prefix }),
  });

  if (!res.ok) {
    throw new Error(`List failed for "${prefix}": ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

async function collectAllFiles() {
  const queue = [''];
  const seen = new Set();
  const files = [];

  while (queue.length) {
    const prefix = queue.shift();
    if (seen.has(prefix)) continue;
    seen.add(prefix);

    const items = await listPrefix(prefix);
    for (const item of items) {
      const child = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        queue.push(child);
      } else {
        files.push({
          key: child,
          size: item.metadata?.size ?? 0,
          mimetype: item.metadata?.mimetype ?? 'application/octet-stream',
        });
      }
    }
  }

  return files;
}

async function r2HasObject(key) {
  const res = await fetch(`${R2_WORKER_URL}/${key}`, {
    method: 'HEAD',
    headers: { 'X-Upload-Key': R2_UPLOAD_KEY },
  });
  return res.ok;
}

async function downloadSourceObject(key) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${SOURCE_BUCKET}/${key}`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    throw new Error(`Download failed for "${key}": ${res.status} ${await res.text()}`);
  }

  return {
    arrayBuffer: await res.arrayBuffer(),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}

async function uploadToR2(key, arrayBuffer, contentType) {
  const res = await fetch(`${R2_WORKER_URL}/${key}`, {
    method: 'PUT',
    headers: {
      'X-Upload-Key': R2_UPLOAD_KEY,
      'Content-Type': contentType,
    },
    body: arrayBuffer,
  });

  if (!res.ok) {
    throw new Error(`Upload failed for "${key}": ${res.status} ${await res.text()}`);
  }
}

async function deleteSourceObject(key) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SOURCE_BUCKET}/${key}`, {
    method: 'DELETE',
    headers: authHeaders,
  });

  if (!res.ok) {
    throw new Error(`Delete failed for "${key}": ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const files = await collectAllFiles();
  const summary = {
    discovered: files.length,
    copied: 0,
    skipped: 0,
    deleted: 0,
    failed: 0,
    failures: [],
  };

  console.log(`Found ${files.length} object(s) in ${SOURCE_BUCKET}.`);

  for (const file of files) {
    try {
      const exists = await r2HasObject(file.key);
      if (exists) {
        console.log(`SKIP ${file.key} (already in R2)`);
        summary.skipped += 1;
        if (DELETE_SOURCE && !DRY_RUN) {
          await deleteSourceObject(file.key);
          summary.deleted += 1;
          console.log(`DELETE ${file.key}`);
        }
        continue;
      }

      if (DRY_RUN) {
        console.log(`PLAN ${file.key} (${file.mimetype}, ${file.size} bytes)`);
        summary.copied += 1;
        continue;
      }

      const source = await downloadSourceObject(file.key);
      await uploadToR2(file.key, source.arrayBuffer, source.contentType);

      const verified = await r2HasObject(file.key);
      if (!verified) {
        throw new Error(`Verification failed for "${file.key}" after upload.`);
      }

      summary.copied += 1;
      console.log(`COPY ${file.key}`);

      if (DELETE_SOURCE) {
        await deleteSourceObject(file.key);
        summary.deleted += 1;
        console.log(`DELETE ${file.key}`);
      }
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({ key: file.key, error: String(error) });
      console.error(`FAIL ${file.key}:`, String(error));
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
