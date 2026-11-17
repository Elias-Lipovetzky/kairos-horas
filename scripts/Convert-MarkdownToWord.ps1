param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Target
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
$document = [xml]::new()
$null = $document.AppendChild($document.CreateXmlDeclaration('1.0', 'UTF-8', $null))
$root = $document.CreateElement('w', 'document', $namespace)
$null = $document.AppendChild($root)
$body = $document.CreateElement('w', 'body', $namespace)
$null = $root.AppendChild($body)

function Add-Paragraph([string]$Text, [string]$Style = 'Normal') {
    $paragraph = $document.CreateElement('w', 'p', $namespace)
    $properties = $document.CreateElement('w', 'pPr', $namespace)
    $styleElement = $document.CreateElement('w', 'pStyle', $namespace)
    $null = $styleElement.SetAttribute('val', $namespace, $Style)
    $null = $properties.AppendChild($styleElement)
    $null = $paragraph.AppendChild($properties)
    $run = $document.CreateElement('w', 'r', $namespace)
    $textElement = $document.CreateElement('w', 't', $namespace)
    $textElement.InnerText = $Text
    $null = $run.AppendChild($textElement)
    $null = $paragraph.AppendChild($run)
    $null = $body.AppendChild($paragraph)
}

# Supports the headings and lists used by our delivery documents.
# Wrapped Markdown prose is joined before creating a Word paragraph.
$pending = ''
foreach ($line in [IO.File]::ReadAllLines($Source)) {
    $line = $line.Trim()
    $isHeading = $line.StartsWith('# ') -or $line.StartsWith('## ')
    $isList = $line.StartsWith('- ') -or $line -match '^\d+\. '
    if (($line -eq '' -or $isHeading -or $isList) -and $pending) {
        Add-Paragraph $pending
        $pending = ''
    }
    if ($line -eq '') { continue }
    if ($line.StartsWith('# ')) {
        Add-Paragraph $line.Substring(2) 'Title'
    } elseif ($line.StartsWith('## ')) {
        Add-Paragraph $line.Substring(3) 'Heading1'
    } elseif ($line.StartsWith('- ')) {
        $pending = [char]0x2022 + ' ' + $line.Substring(2)
    } else {
        $pending = ($pending + ' ' + $line).Trim()
    }
}
if ($pending) { Add-Paragraph $pending }

$section = $document.CreateElement('w', 'sectPr', $namespace)
$pageSize = $document.CreateElement('w', 'pgSz', $namespace)
$null = $pageSize.SetAttribute('w', $namespace, '11906')
$null = $pageSize.SetAttribute('h', $namespace, '16838')
$null = $section.AppendChild($pageSize)
$margins = $document.CreateElement('w', 'pgMar', $namespace)
foreach ($edge in @('top', 'right', 'bottom', 'left')) {
    $null = $margins.SetAttribute($edge, $namespace, '1134')
}
$null = $section.AppendChild($margins)
$null = $body.AppendChild($section)

$templates = Join-Path $PSScriptRoot 'templates/word'
$entries = @{
    '[Content_Types].xml' = 'content-types.xml'
    '_rels/.rels' = 'root-relationships.xml'
    'word/_rels/document.xml.rels' = 'document-relationships.xml'
    'word/styles.xml' = 'styles.xml'
}
$stream = [IO.File]::Open($Target, [IO.FileMode]::Create)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entry in $entries.GetEnumerator()) {
        $content = [IO.File]::ReadAllText((Join-Path $templates $entry.Value))
        $null = [xml]$content
        $zipEntry = $zip.CreateEntry($entry.Key)
        $writer = [IO.StreamWriter]::new($zipEntry.Open(), [Text.UTF8Encoding]::new($false))
        try { $writer.Write($content) } finally { $writer.Dispose() }
    }
    $zipEntry = $zip.CreateEntry('word/document.xml')
    $writer = [IO.StreamWriter]::new($zipEntry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write($document.OuterXml) } finally { $writer.Dispose() }
} finally {
    $zip.Dispose()
    $stream.Dispose()
}
Write-Output "Generated Word document: $Target"
