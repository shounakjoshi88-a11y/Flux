import { readFileSync, writeFileSync } from "fs";

let content = readFileSync("D:/P_project/Flux/frontend/src/pages/Privacy.tsx", "utf8");

const newBlock =
  `initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />`;

const regex = /initial=\{\{ opacity: 0, y: 12 \}\}\s*\n\s*animate=\{\{ opacity: 1, y: 0 \}\}\s*\n\s*transition=\{\s*duration:\s*0\.5[^}]*\}\s*\n\s*\>/g;

content = content.replace(regex, newBlock);

// Also replace any remaining old h2 mb-4
content = content.replace(
  /className="font-serif text-2xl tracking-tight text-foreground mb-4 flex items-center gap-3"/g,
  'className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3"'
);

writeFileSync("D:/P_project/Flux/frontend/src/pages/Privacy.tsx", content, "utf8");
console.log("Done");
