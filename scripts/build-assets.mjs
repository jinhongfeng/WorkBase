import { copyFileSync } from 'node:fs'
import './build-vault-host.mjs'
copyFileSync('src/renderer/src/styles/tokens.css', 'dist/renderer/tokens.css')
