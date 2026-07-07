import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  {
    // src/migrations/** is Payload-generated code (unused payload/req args
    // in the up/down signatures) — never hand-edited, so not linted.
    ignores: ['node_modules/**', '.next/**', 'vendor/**', 'deploy/**', 'src/migrations/**'],
  },
  ...coreWebVitals,
  ...typescript,
]

export default eslintConfig
