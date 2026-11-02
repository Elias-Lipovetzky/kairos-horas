$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'requerimientos/Requerimientos-Kairos.md'
$target = Join-Path $root 'requerimientos/Requerimientos-Kairos.docx'
$paragraphs = foreach ($line in [IO.File]::ReadAllLines($source)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $style = 'Normal'
    $value = $line
    if ($line.StartsWith('# ')) { $style = 'Title'; $value = $line.Substring(2) }
    elseif ($line.StartsWith('## ')) { $style = 'Heading1'; $value = $line.Substring(3) }
    elseif ($line.StartsWith('- ')) { $value = [char]0x2022 + ' ' + $line.Substring(2) }
    '<w:p><w:pPr><w:pStyle w:val="' + $style + '"/></w:pPr><w:r><w:t xml:space="preserve">' + [Security.SecurityElement]::Escape($value) + '</w:t></w:r></w:p>'
}
$document = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ($paragraphs -join '') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>'
$null = [xml]$document
$zip = [IO.Compression.ZipFile]::Open($target, [IO.Compression.ZipArchiveMode]::Update)
try {
    $zip.GetEntry('word/document.xml').Delete()
    $entry = $zip.CreateEntry('word/document.xml')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write($document) } finally { $writer.Dispose() }
} finally { $zip.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($target)
try {
    foreach ($entry in $check.Entries) {
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $null = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
    }
} finally { $check.Dispose() }
Write-Output "Documento actualizado y XML verificado: $target"
