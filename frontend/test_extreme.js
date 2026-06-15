
const katex = require('katex');

function repairLatex(formula) {
  if (!formula) return "";
  let s = formula
    .replace(/(?<!\\)\\\[(-?\d+(?:pt|em|ex|cm|mm|in|pc|px|vh|vw|vmin|vmax))\]/g, "\\\\\[$1\]")
    .replace(/\\(big|Big|bigg|Bigg)(l|r)\{/g, "\\$1$2\\{")
    .replace(/\\(big|Big|bigg|Bigg)(l|r)\}/g, "\\$1$2\\}")
    .replace(/\\substack\{([\s\S]*?)\}/g, (_, content) => {
      const cleaned = content.replace(/\\\\(\[-?\d+(?:pt|em|ex|cm|mm|in|pc|px)\])/g, "\\\\");
      return `\\substack{${cleaned}}`;
    })
    .replace(/\\(int|oint|iint|iiint|sum|prod)\{/g, "\\$1_{")
    .replace(/\\text\{lim\}\s*;?/g, "\\lim")
    .replace(/\\lim\s*;/g, "\\lim")
    .replace(/([_^])\{,\s*/g, "$1{")
    .replace(/([a-zA-Z0-9}])\s*,\s*([a-zA-Z\\{])/g, "$1\\, $2")
    .replace(/(\\operatorname\{[^}]+\})\{,\s*([^}]+)\}/g, "$1_{$2}")
    .replace(/([A-Za-z])\{,\s*([^}]+)\}/g, "$1_{$2}")
    .replace(/\\(Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|det|deg|gcd|min|max|lim|sup|inf)!(?=\s*[\\({\[])/g, "\\$1")
    .replace(/!{2,}/g, (m) => m.split("").map(() => "\\!").join(" "))
    .replace(/(?<!\\)exp!/g, "exp\\!")
    .replace(/(?<!\\)\b(lim|sin|cos|tan|log|exp|det|deg|gcd|min|max|inf|sup)\b(?=\s*[_^{(])/g, "\\$1")
    .replace(/(\|)\{([A-Za-z0-9]+)\}/g, "$1_{$2}")
    .replace(/(?<!\\)\|\|/g, "\\|")
    .replace(/;\s*(d[a-zA-Z]\b)/g, "\\,$1")
    .replace(/([-+])\s*;/g, "$1")
    .replace(/;\s*(\\frac|\\sum|\\prod|\\int|\\lim|\\exp|\\bigg|\\Big|\\left|\\right)/g, "\\; $1")
    .replace(/;(\s*\\\\|\s*$)/g, "$1")
    .replace(/(?<!\\)\[(-?\d+(?:pt|em|ex|cm|mm|in|pc|px|vh|vw|vmin|vmax))\s*\]/g, "");
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  if (opens > closes) s += "}".repeat(opens - closes);
  else if (closes > opens) {
    for (let i = 0; i < (closes - opens); i++) s = s.replace(/\}$/, "");
  }
  return s.trim();
}

const cases = {
  13: `\\Huge{\\mathbf{\\mathbb{\\mathcal{F}}_{\\text{\\tiny{\\textsc{max}}}}}} = \\sum_{\\substack{i,j,k=1 \\\\ i<j<k}}^{n} \\frac{\\partial^3 \\Psi}{\\partial x_i \\partial x_j \\partial x_k}`,
  14: `\\frac{\\phantom{XXXXXXXXXX}1\\phantom{XXXXXXXXXX}}{\\phantom{XXXX}2\\phantom{XXXX}} \\quad vs \\quad \\frac{1}{2}`,
  15: `\\hat{\\tilde{\\bar{\\vec{\\dot{\\ddot{x}}}}}} \\quad \\overbrace{\\underbrace{\\widetilde{\\widehat{ABC}}}_{\\text{under}}}^{\\text{over}} \\quad \\stackrel{\\stackrel{a}{b}}{\\stackrel{c}{d}}`,
  16: `f(x) = \\begin{cases}
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} & \\text{if } x \\in \\left\\{ \\sum_{n=1}^{\\infty} \\frac{1}{n^2}, \\int_0^\\infty e^{-t^2}dt \\right\\} \\\\
\\left[ \\dfrac{\\partial^2 u}{\\partial x^2} + \\dfrac{\\partial^2 u}{\\partial y^2} = 0 \\right] & \\text{if } (x,y) \\in \\Omega \\setminus \\partial\\Omega \\\\
\\exp\\left( \\sum_{k=1}^{n} \\log\\left(1 + \\frac{x}{k}\\right) \\right) & \\text{otherwise}
\\end{cases}`,
  // 17 requires mhchem
  18: `∮∯∰ ∱∲∳ ⨌⨍⨎⨏ ⨐⨑⨒⨓ ⨔⨕⨖⨗ ⨘⨙⨚⨛ ⨜⨝⨞⨟`,
  20: `\\boxed{
\\frac{
\\left\\langle \\Psi \\middle| \\hat{\\mathcal{H}} \\middle| \\Phi \\right\\rangle
}{
\\sqrt{
\\displaystyle\\int\\!\\!\\!\\!\\int_{\\mathbb{R}^2} \\left| \\sum_{n=-\\infty}^{\\infty} \\frac{J_n(z)}{n!} \\right|^2 d\\mu
}
}
= \\exp\\left( i\\oint_{\\gamma} \\vec{A}\\cdot d\\vec{r} \\right)
}`
};

for (const [id, formula] of Object.entries(cases)) {
  console.log(`Testing Case \${id}...`);
  try {
    const repaired = repairLatex(formula);
    katex.renderToString(repaired, { displayMode: true, throwOnError: true });
    console.log(`Case \${id}: SUCCESS`);
  } catch (e) {
    console.log(`Case \${id}: FAILED`, e.message);
  }
}
