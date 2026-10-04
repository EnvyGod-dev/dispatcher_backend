import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/home/zoloo/uploads';
const BASE_URL = process.env.APP_URL || 'https://www.stratum.mn';

export const localStorage = {
    async upload(filePath: string, buffer: Uint8Array, _contentType: string): Promise<{ error: null | { message: string } }> {
        try {
            const fullPath = path.join(UPLOAD_DIR, filePath);
            const dir = path.dirname(fullPath);

            if (!existsSync(dir)) {
                await mkdir(dir, { recursive: true });
            }

            await writeFile(fullPath, buffer);
            return { error: null };
        } catch (err: any) {
            return { error: { message: err.message } };
        }
    },

    getPublicUrl(filePath: string): { data: { publicUrl: string } } {
        return {
            data: {
                publicUrl: `${BASE_URL}/uploads/${filePath}`,
            },
        };
    },
};