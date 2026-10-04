import {
    S3Client,
    ListObjectsV2Command,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const client = new S3Client({
    region: "auto",
    endpoint: "https://095898adf87f2a64702ce3948d3ddebe.r2.cloudflarestorage.com",
    credentials: {
        accessKeyId: "d7dd83b4d676d90bdc0793b30d2fdf4f",
        secretAccessKey: "9097dc219b25190a612818dd3506cda47747cec462017c7ba13b6fa9071cdf2f",
    },
});

const BUCKET = "stratum-inspections";

async function deleteUploadsFolder() {
    // uploads/ доторх бүх файл жагсаах
    const listed = await client.send(
        new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: "uploads/",
        })
    );

    const objects = listed.Contents ?? [];
    console.log(`🗑️ ${objects.length} файл устгана...`);

    for (const obj of objects) {
        if (!obj.Key) continue;
        await client.send(
            new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key })
        );
        console.log(`✅ Устгасан: ${obj.Key}`);
    }

    console.log("🎉 Дууслаа!");
}

deleteUploadsFolder();