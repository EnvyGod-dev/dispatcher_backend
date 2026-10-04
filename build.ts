import { build } from "esbuild";
import type { BuildOptions } from "esbuild";

const options = {
        bundle: true,
        entryPoints: ["./src/server.ts"],
        banner: {
                js: [
                        "#!/usr/bin/env node",
                        'import { createRequire } from "module";',
                        'import { fileURLToPath } from "url";',
                        'import { dirname } from "path";',
                        "const require = createRequire(import.meta.url);",
                        "const __filename = fileURLToPath(import.meta.url);",
                        "const __dirname = dirname(__filename);",
                ].join("\n"),
        },
        platform: "node",
        outfile: "./dist/index.js",
        minify: true,
        format: "esm",
        logLevel: "info",
        external: [
                "bcrypt",
                "bcryptjs",
                "firebase-admin",
                "@node-rs/bcrypt",
        ],
} satisfies BuildOptions;

const buildApp = async () => {
        try {
                await build(options);
        } catch (error) {
                console.log(error);
                process.exit(1);
        }
};

await buildApp();
