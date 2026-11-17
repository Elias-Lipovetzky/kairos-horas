$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'Convert-MarkdownToWord.ps1') `
    -Source (Join-Path $root 'docs/Manual-de-uso.md') `
    -Target (Join-Path $root 'docs/Manual-de-uso.docx')
