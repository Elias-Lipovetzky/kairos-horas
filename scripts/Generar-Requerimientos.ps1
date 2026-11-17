$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'Convert-MarkdownToWord.ps1') `
    -Source (Join-Path $root 'requerimientos/Requerimientos-Kairos.md') `
    -Target (Join-Path $root 'requerimientos/Requerimientos-Kairos.docx')
