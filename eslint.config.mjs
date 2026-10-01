import nextConfig from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextConfig,
  ...nextTypescript,
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
];

export default eslintConfig;
