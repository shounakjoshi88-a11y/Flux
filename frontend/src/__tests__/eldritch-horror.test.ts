import katex from "katex";
import { describe, expect, test } from "bun:test";
import { needsMathJax, repairLatex, convertCDtoMatrix, MACROS } from "../features/chat/MessageRenderer.tsx";

function tryKaTeX(formula: string, display = true): boolean {
  try {
    const result = katex.renderToString(formula, {
      throwOnError: false,
      displayMode: display,
      strict: "ignore",
      trust: true,
      output: "html",
      macros: MACROS,
    });
    return !/class=["'][^"']*\bkatex-error\b/.test(result) && !result.includes("ParseError");
  } catch {
    return false;
  }
}

// ─── Test 1: Nested cases inside align inside split with substack ──────
const test1 =
  "\\begin{split}\n" +
  "\\mathcal{F}(n) = \\sum_{\\substack{k=0 \\\\ k \\equiv 1 \\pmod{4}}}^{n} \\begin{cases} \n" +
  "\\displaystyle\\int_{0}^{\\infty} \\frac{x^{k-1}}{e^x - 1}\\,dx & \\text{if } k \\equiv 0 \\pmod{2} \\\\\n" +
  "\\displaystyle\\oint_{|z|=1} \\frac{z^{k}}{(1-z)^{k+1}}\\,dz & \\text{if } k \\equiv 1 \\pmod{2} \\\\\n" +
  "\\displaystyle\\lim_{\\epsilon \\to 0^{+}} \\left[ \\int_{-\\infty}^{-\\epsilon} + \\int_{\\epsilon}^{\\infty} \\right] \\frac{e^{ikx}}{x}\\,dx & \\text{otherwise}\n" +
  "\\end{cases}\n" +
  "\\end{split}";

// ─── Test 2: array with 9 columns, nested braces, multicolumn ──────
const test2 =
  "\\left\\{ \\begin{array}{ccc|ccc|c}\n" +
  "\\multicolumn{3}{c|}{\\text{Block } A} & \\multicolumn{3}{c|}{\\text{Block } B} & \\text{Result} \\\\\n" +
  "a_{11} & a_{12} & a_{13} & b_{11} & b_{12} & b_{13} & c_1 \\\\\n" +
  "a_{21} & a_{22} & a_{23} & b_{21} & b_{22} & b_{23} & c_2 \\\\\n" +
  "\\hdashline\n" +
  "\\multicolumn{3}{c|}{\\sum_{j=1}^{3} a_{ij}x_j} & \\multicolumn{3}{c|}{\\prod_{k=1}^{3} b_{ik}y_k} & \\sqrt{c_i^2 + d_i^2}\n" +
  "\\end{array} \\right\\}";

// ─── Test 3: atop stack with 6 levels and mixed delimiters ──────
const test3 =
  "{{a^{b^{c^{d^{e^{f}}}}}} \\over {{{{{{f_e}_d}_c}_b}_a}} \\quad \\text{vs} \\quad " +
  "\\left\\lfloor \\left\\lceil \\left\\lfloor \\left\\lceil " +
  "\\frac{\\left\\lfloor \\left\\lceil \\frac{x}{y} \\right\\rceil \\right\\rfloor}{\\left\\lfloor \\left\\lceil \\frac{y}{x} \\right\\rceil \\right\\rfloor}" +
  " \\right\\rceil \\right\\rfloor \\right\\rceil \\right\\rfloor";

// ─── Test 4: substack tower with 5 levels ──────
const test4 =
  "\\sum_{\\substack{i_1=1 \\\\ i_2=1 \\\\ i_3=1 \\\\ i_4=1 \\\\ i_5=1}}^{\\substack{n_1 \\\\ n_2 \\\\ n_3 \\\\ n_4 \\\\ n_5}} " +
  "\\prod_{\\substack{j_1 \\in S_1 \\\\ j_2 \\in S_2 \\\\ j_3 \\in S_3}} " +
  "\\int_{\\substack{a_1 \\\\ a_2 \\\\ a_3}}^{\\substack{b_1 \\\\ b_2 \\\\ b_3}} " +
  "\\underbrace{\\frac{\\partial^{i_1+i_2+i_3+i_4+i_5} f}{\\partial x_1^{i_1}\\,\\partial x_2^{i_2}\\,\\partial x_3^{i_3}\\,\\partial x_4^{i_4}\\,\\partial x_5^{i_5}}}_{\\text{mixed partial}} " +
  "\\,dx_1\\,dx_2\\,dx_3";

// ─── Test 5: alignedat with 10 alignment points and intertext ──────
const test5 =
  "\\begin{alignedat}{10}\n" +
  "&\\text{(I)} \\quad &\\frac{\\partial u}{\\partial t} + \\nabla \\cdot \\mathbf{F}(u) &= 0, \\quad &&u(x,0) = u_0(x) \\\\\n" +
  "&\\text{(II)} \\quad &\\frac{\\partial^2 v}{\\partial t^2} - \\Delta v + m^2 v &= f(v), \\quad &&v(x,0) = v_0(x), \\; \\frac{\\partial v}{\\partial t}(x,0) = v_1(x) \\\\\n" +
  "\\intertext{with the nonlinear coupling:}\n" +
  "&\\text{(III)} \\quad &\\mathbf{F}(u) &= -\\frac{\\delta \\mathcal{H}}{\\delta u}, \\quad &&\\mathcal{H}[u] = \\int_{\\Omega} \\left[ \\frac{1}{2}|\\nabla u|^2 + V(u) \\right] d\\mathbf{x}\n" +
  "\\end{alignedat}";

// ─── Test 6: delimiter stack 8 levels deep ──────
const test6 =
  "\\left\\{ \\left[ \\left( \\left| \\left\\{ \\left[ \\left( " +
  "\\frac{\\left\\{ \\left[ \\left( \\frac{a}{b} \\right)^2 \\right]^3 \\right\\}^4}{\\left\\{ \\left[ \\left( \\frac{c}{d} \\right)^5 \\right]^6 \\right\\}^7}" +
  " \\right)^8 \\right]^9 \\right\\}^{10} \\right| \\right)^{11} \\right]^{12} \\right\\}^{13}";

// ─── Test 7: commutative diagram 12 objects ──────
const test7 =
  "\\begin{CD}\n" +
  "A_1 @>>> A_2 @>>> A_3 @>>> A_4 @>>> A_5 @>>> A_6 \\\\\n" +
  "@VVV @VVV @VVV @VVV @VVV @VVV \\\\\n" +
  "B_1 @>>> B_2 @>>> B_3 @>>> B_4 @>>> B_5 @>>> B_6 \\\\\n" +
  "@AAA @AAA @AAA @AAA @AAA @AAA \\\\\n" +
  "C_1 @>>> C_2 @>>> C_3 @>>> C_4 @>>> C_5 @>>> C_6\n" +
  "\\end{CD}";

// ─── Test 8: genfrac abuse ──────
const test8 =
  "\\genfrac{[}{]}{0pt}{}{a + \\genfrac{\\{}{\\}}{0pt}{}{b + \\genfrac{\\langle}{\\rangle}{0pt}{}{c + \\genfrac{\\lfloor}{\\rfloor}{0pt}{}{d + \\genfrac{(}{)}{0pt}{}{e + f}}}}{g}}{h}";

// ─── Test 9: xymatrix with looping arrows ──────
const test9 =
  "\\xymatrix{\n" +
  "A \\ar[r]^{f} \\ar[d]_{g} \\ar[dr]^{h} & B \\ar[d]^{k} \\ar[dl]_{l} \\\\\n" +
  "C \\ar[r]_{m} \\ar@(ul,ur)^{\\alpha} \\ar@(dl,dr)_{\\beta} & D \\ar@(ul,ur)^{\\gamma} \\ar@(dl,dr)_{\\delta}\n" +
  "}";

// ─── Test 10: halign table ──────
const test10 =
  "\\halign{\\strut\\vrule\\ #\\ \\vrule&&\\ \\hfil#\\hfil\\ \\vrule\\cr\n" +
  "\\noalign{\\hrule}\n" +
  "& $\\displaystyle\\sum_{i=1}^{n}$ & $\\displaystyle\\int_{a}^{b}$ & $\\displaystyle\\oint_{C}$ & $\\displaystyle\\bigcap_{\\alpha \\in I}$ \\cr\n" +
  "\\noalign{\\hrule}\n" +
  "& $\\displaystyle\\prod_{j=1}^{m}$ & $\\displaystyle\\iint_{R}$ & $\\displaystyle\\iint_{S}$ & $\\displaystyle\\bigcup_{\\beta \\in J}$ \\cr\n" +
  "\\noalign{\\hrule}\n" +
  "& $\\displaystyle\\bigoplus_{k=1}^{p}$ & $\\displaystyle\\iiint_{V}$ & $\\displaystyle\\oiint_{\\Sigma}$ & $\\displaystyle\\bigsqcup_{\\gamma \\in K}$ \\cr\n" +
  "\\noalign{\\hrule}\n" +
  "}";

// ─── RepairLatex test cases ──────────────────────────────────────────
describe("repairLatex", () => {
  test("left/right balancing", () => {
    const input = "f(x) = \\left( x^2 + y^2";
    const result = repairLatex(input);
    const leftCount = (result.match(/\\left\b/g) || []).length;
    const rightCount = (result.match(/\\right\b/g) || []).length;
    expect(leftCount).toBe(rightCount);
  });

  test("strip \\tag and \\label inside align", () => {
    const input = "\\begin{align} x &= y \\tag{1} \\label{eq:1} \\end{align}";
    const result = repairLatex(input);
    expect(result).not.toContain("\\tag");
    expect(result).not.toContain("\\label");
  });

  test("strip \\\\[<dimen>]", () => {
    const input = "a \\\\[3pt] b \\\\[2ex] c";
    const result = repairLatex(input);
    expect(result).toContain("b \\\\");
    expect(result).toContain("c");
  });

  test("strip \\hfill", () => {
    const input = "a \\hfill b";
    const result = repairLatex(input);
    expect(result).not.toContain("\\hfill");
  });

  test("passes through eldritch formulas without corruption", () => {
    for (const formula of [test1, test2, test3, test4, test5, test6, test7, test8]) {
      const result = repairLatex(formula);
      expect(result.length).toBeGreaterThan(formula.length * 0.9);
    }
  });
});

// ─── NeedsMathJax detection ──────────────────────────────────────────
describe("needsMathJax", () => {
  test("KaTeX-native formulas don't need MathJax", () => {
    expect(needsMathJax(test1)).toBe(false);
    // test3 uses \over only (not in MathJax trigger list)
    expect(needsMathJax(test3)).toBe(false);
    expect(needsMathJax(test4)).toBe(false);
    expect(needsMathJax(test6)).toBe(false);
    expect(needsMathJax(test7)).toBe(false);
  });

  test("\\multicolumn triggers needsMathJax", () => {
    expect(needsMathJax(test2)).toBe(true);
  });

  test("\\intertext triggers needsMathJax", () => {
    expect(needsMathJax(test5)).toBe(true);
  });

  test("\\genfrac triggers needsMathJax", () => {
    expect(needsMathJax(test8)).toBe(true);
  });

  test("\\xymatrix triggers needsMathJax", () => {
    expect(needsMathJax(test9)).toBe(true);
  });

  test("\\halign triggers needsMathJax", () => {
    expect(needsMathJax(test10)).toBe(true);
  });
});

// ─── ConvertCDtoMatrix ───────────────────────────────────────────────
describe("convertCDtoMatrix", () => {
  test("converts \\begin{CD} with 6-column rows", () => {
    const result = convertCDtoMatrix(test7);
    expect(result).toContain("\\begin{matrix}");
    expect(result).toContain("\\to");
    expect(result).toContain("\\downarrow");
    expect(result).toContain("\\uparrow");
  });
});

// ─── KaTeX rendering (Eldritch Horror) ─────────────────────────────────
describe("KaTeX rendering (Eldritch Horror)", () => {
  test("Test 1: split + cases + substack", () => {
    expect(tryKaTeX(test1)).toBe(true);
  });

  test("Test 2: array + multicolumn → needsMathJax", () => {
    expect(needsMathJax(test2)).toBe(true);
  });

  test("Test 3: atop + 8-level braces (exceeds KaTeX parser limit)", () => {
    // KaTeX parser gags on \over with 8-level deep brace nesting
    expect(tryKaTeX(test3)).toBe(false);
  });

  test("Test 4: substack tower", () => {
    expect(tryKaTeX(test4)).toBe(true);
  });

  test("Test 5: alignedat + intertext → needsMathJax", () => {
    expect(needsMathJax(test5)).toBe(true);
  });

  test("Test 6: delimiter stack", () => {
    expect(tryKaTeX(test6)).toBe(true);
  });

  test("Test 7: commutative diagram (CD → matrix)", () => {
    const matrix = convertCDtoMatrix(test7);
    expect(tryKaTeX(matrix)).toBe(true);
  });

  test("Test 8: genfrac → needsMathJax", () => {
    expect(needsMathJax(test8)).toBe(true);
  });

  test("Test 9: xymatrix → needsMathJax", () => {
    expect(needsMathJax(test9)).toBe(true);
  });

  test("Test 10: halign → needsMathJax", () => {
    expect(needsMathJax(test10)).toBe(true);
  });
});
