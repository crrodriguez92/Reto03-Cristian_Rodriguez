
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== PUBLICAR PROYECTO ===" -ForegroundColor Cyan

# 1. Validar compilacion
npm run build
if ($LASTEXITCODE -ne 0) {
    throw "La compilacion fallo. No se publicaron los cambios."
}

# 2. Revisar los cambios
git status --short

$mensaje = Read-Host "Escribe el mensaje de esta actualizacion"
if ([string]::IsNullOrWhiteSpace($mensaje)) {
    throw "Debes escribir un mensaje."
}

# 3. Preparar cambios
git add -A
if ($LASTEXITCODE -ne 0) {
    throw "No se pudieron preparar los cambios."
}

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No hay cambios nuevos para publicar."
    exit 0
}

# 4. Crear commit
git commit -m $mensaje
if ($LASTEXITCODE -ne 0) {
    throw "No se pudo crear el commit."
}

# 5. Enviar a GitHub
git push
if ($LASTEXITCODE -ne 0) {
    throw "No se pudieron enviar los cambios a GitHub."
}

Write-Host "`nCambios enviados a GitHub." -ForegroundColor Green
Write-Host "Render iniciara el despliegue si esta configurado para hacerlo." -ForegroundColor Green
