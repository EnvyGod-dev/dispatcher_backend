import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";

function getEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing env: ${key}`);
    return val;
}

const client = new S3Client({
    region: "auto",
    endpoint: `https://${getEnv("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: getEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
        secretAccessKey: getEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    },
});

const BUCKET = getEnv("CLOUDFLARE_R2_BUCKET_NAME");
const PUBLIC_URL = getEnv("CLOUDFLARE_R2_PUBLIC_URL").replace(/\/$/, "");

export interface UploadOptions {
    contentType: string;
    upsert?: boolean;
}

export interface UploadResult {
    data: { path: string } | null;
    error: Error | null;
}

export interface RemoveResult {
    error: Error | null;
}

export interface PublicUrlResult {
    data: { publicUrl: string };
}

export const r2Storage = {
    storage: {
        from(_bucket: string) {
            return {
                async upload(
                    path: string,
                    buffer: Buffer,
                    options: UploadOptions
                ): Promise<UploadResult> {
                    try {
                        await client.send(
                            new PutObjectCommand({
                                Bucket: BUCKET,
                                Key: path,
                                Body: buffer,
                                ContentType: options.contentType,
                                CacheControl: "public, max-age=31536000",
                            })
                        );
                        return { data: { path }, error: null };
                    } catch (err) {
                        console.error(`[R2] Upload failed for path "${path}":`, err);
                        return { data: null, error: err as Error };
                    }
                },

                getPublicUrl(path: string): PublicUrlResult {
                    return {
                        data: {
                            publicUrl: `${PUBLIC_URL}/${path}`,
                        },
                    };
                },

                async remove(paths: string[]): Promise<RemoveResult> {
                    try {
                        await Promise.all(
                            paths.map((p) =>
                                client.send(
                                    new DeleteObjectCommand({ Bucket: BUCKET, Key: p })
                                )
                            )
                        );
                        return { error: null };
                    } catch (err) {
                        console.error(`[R2] Delete failed for paths:`, paths, err);
                        return { error: err as Error };
                    }
                },
            };
        },
    },
};

// Supabase-тай нийцтэй байлгах бол (backward compatibility)
export const supabaseServer = r2Storage;