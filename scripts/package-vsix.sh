#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT/code-resonance-0.2.0.vsix}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/extension"
cp "$ROOT/extension/extension.js" "$ROOT/extension/outbox.js" "$ROOT/extension/package.json" "$ROOT/extension/README.md" "$TMP/extension/"
cat > "$TMP/[Content_Types].xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/octet-stream" />
  <Default Extension="md" ContentType="text/markdown" />
</Types>
XML
cat > "$TMP/extension.vsixmanifest" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Id="zerobandwidth.code-resonance" Version="0.2.0" Language="en-US" Publisher="zerobandwidth" />
    <DisplayName>Code Resonance</DisplayName>
    <Description xml:space="preserve">Local-first software development capture for an evolving audiovisual performance.</Description>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.99.0" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.99.0,)" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
  </Assets>
</PackageManifest>
XML
mkdir -p "$(dirname "$DEST")"
(cd "$TMP" && zip -q -r "$DEST" '[Content_Types].xml' extension.vsixmanifest extension)
echo "Created $DEST"
