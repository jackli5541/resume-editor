param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$PreviewPath,
  [string]$PdfToPpmPath = $(if ($env:PDFTOPPM_BIN) { $env:PDFTOPPM_BIN } else { "pdftoppm" })
)

$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
$previewDirectory = Split-Path -Parent $PreviewPath
New-Item -ItemType Directory -Force -Path $previewDirectory | Out-Null
$pdfPath = [System.IO.Path]::ChangeExtension($PreviewPath, ".preview.pdf")
$previewBase = [System.IO.Path]::Combine(
  $previewDirectory,
  [System.IO.Path]::GetFileNameWithoutExtension($PreviewPath)
)

$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($resolvedSource, $false, $true)
  $document.ExportAsFixedFormat($pdfPath, 17)
  $document.Close($false)
  $document = $null
  & $PdfToPpmPath -png -f 1 -singlefile -r 120 $pdfPath $previewBase
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $PreviewPath)) {
    throw "pdftoppm failed to create $PreviewPath"
  }
} finally {
  if ($document) { $document.Close($false) }
  if ($word) { $word.Quit() }
  Remove-Item -LiteralPath $pdfPath -Force -ErrorAction SilentlyContinue
}
