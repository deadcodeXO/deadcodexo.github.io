const fs = require("fs");

fs.cpSync("dist/pagefind", "public/pagefind", { recursive: true, force: true });
console.log("Copied pagefind index to public/pagefind");
