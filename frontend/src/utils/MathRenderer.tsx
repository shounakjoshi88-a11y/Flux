import katex from 'katex';

interface InlineMathProps {
  formula: string;
}

export function InlineMath({ formula }: InlineMathProps) {
  const html = katex.renderToString(formula, {
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
  const html = katex.renderToString(formula, {
    throwOnError: false,
    displayMode: true,
    strict: "ignore",
  });
  return (
    <div
      className="my-4 text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}