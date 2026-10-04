import {
    S3Client,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const client = new S3Client({
    region: "auto",
    endpoint: "https://095898adf87f2a64702ce3948d3ddebe.r2.cloudflarestorage.com",
    credentials: {
        accessKeyId: "d7dd83b4d676d90bdc0793b30d2fdf4f",
        secretAccessKey: "9097dc219b25190a612818dd3506cda47747cec462017c7ba13b6fa9071cdf2f",
    },
});

const BUCKET = "stratum-inspections";

const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
};

const UPLOADS = [
    { localPath: "C:\\Users\\Asus\\Downloads\\vehicles", r2Prefix: "vehicles" },
    { localPath: "C:\\Users\\Asus\\Downloads\\users", r2Prefix: "users" },
    { localPath: "C:\\Users\\Asus\\Downloads\\inspections", r2Prefix: "inspections" },
];

async function uploadAll() {
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const { localPath, r2Prefix } of UPLOADS) {
        if (!fs.existsSync(localPath)) {
            console.warn(`⚠️  Folder олдсонгүй, алгасав: ${localPath}`);
            continue;
        }

        const files = fs.readdirSync(localPath);
        const imageFiles = files.filter((f) => {
            const ext = path.extname(f).toLowerCase();
            return ext in MIME_TYPES;
        });

        console.log(`\n📁 ${r2Prefix}: ${imageFiles.length} зураг олдлоо`);

        let success = 0;
        let failed = 0;

        for (const file of imageFiles) {
            const filePath = path.join(localPath, file);
            const ext = path.extname(file).toLowerCase();
            const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

            try {
                const buffer = fs.readFileSync(filePath);

                await client.send(
                    new PutObjectCommand({
                        Bucket: BUCKET,
                        Key: `${r2Prefix}/${file}`,
                        Body: buffer,
                        ContentType: contentType,
                        CacheControl: "public, max-age=31536000",
                    })
                );

                console.log(`  ✅ ${r2Prefix}/${file}`);
                success++;
            } catch (err) {
                console.error(`  ❌ ${file}:`, (err as Error).message);
                failed++;
            }
        }

        console.log(`  → ${success} амжилттай, ${failed} алдаатай`);
        totalSuccess += success;
        totalFailed += failed;
    }

    console.log(`\n🎉 Бүгд дууслаа: ${totalSuccess} амжилттай, ${totalFailed} алдаатай`);
}

uploadAll();