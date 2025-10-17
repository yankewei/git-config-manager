import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const distDir = join(process.cwd(), "dist");
mkdirSync(distDir, { recursive: true });

const placeholder = `This placeholder file ensures the Go embed directive has a matching file
even when the frontend build output has not been generated yet.
Run \`npm run build\` to populate this directory with the production assets.
`;

writeFileSync(join(distDir, "README.md"), placeholder);
