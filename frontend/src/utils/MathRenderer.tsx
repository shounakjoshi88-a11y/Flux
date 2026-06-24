import katex from 'katex';

function sanitizeFormula(f: string): string {
  return f.replace(/(?<!\\)#/g, '\\#');
}

interface InlineMathProps {
  formula: string;
}

export function InlineMath({ formula }: InlineMathProps) {
  const html = katex.renderToString(sanitizeFormula(formula), {
    throwOnError: false,
    displayMode: false,
    strict: "ignore",
  });
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="inline-block align-middle leading-none"
    />
  );
}

interface DisplayMathProps {
  formula: string;
}

export function DisplayMath({ formula }: DisplayMathProps) {
  const html = katex.renderToString(sanitizeFormula(formula), {
    throwOnError: false,
    displayMode: true,
    strict: "ignore",
  });
  return (
    <span
      className="my-4 text-center block"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}