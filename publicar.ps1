$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== PUBLICACION DEL PROYECTO ===" -ForegroundColor Cyan

# 1. Verificar que existan cambios
git status --short
if ($LASTEXITCODE -ne 0) {
    throw "No fue posible consultar el estado de Git."
}

$estado = git status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "No fue posible consultar el estado de Git."
}

if ([string]::IsNullOrWhiteSpace(($estado -join "`n"))) {
    Write-Host "No hay cambios para publicar." -ForegroundColor Yellow
    exit 0
}

# 2. Compilar el proyecto
Write-Host "`n=== 1. COMPILACION ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    throw "La compilacion fallo. Se cancela la publicacion."
}

# 3. Ejecutar todas las pruebas configuradas en npm test
Write-Host "`n=== 2. PRUEBAS AUTOMATIZADAS ===" -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) {
    throw "Las pruebas fallaron. Se cancela la publicacion."
}

# 4. Solicitar tipo de version
Write-Host "`n=== 3. VERSIONAMIENTO ===" -ForegroundColor Cyan
Write-Host "1. PATCH: correcciones (1.0.0 -> 1.0.1)"
Write-Host "2. MINOR: funcionalidades compatibles (1.0.1 -> 1.1.0)"
Write-Host "3. MAJOR: cambios incompatibles (1.1.0 -> 2.0.0)"

$opcion = Read-Host "Selecciona 1, 2 o 3"

switch ($opcion) {
    "1" { $tipo = "patch" }
    "2" { $tipo = "minor" }
    "3" { $tipo = "major" }
    default { throw "Opcion invalida. No se modifico la version." }
}

# 5. Solicitar mensaje antes de incrementar la version
$mensaje = Read-Host "Mensaje del commit"
if ([string]::IsNullOrWhiteSpace($mensaje)) {
    throw "El mensaje del commit es obligatorio. No se incremento la version."
}

# 6. Incrementar package.json y package-lock.json
$versionAnterior = node -p "require('./package.json').version"
if ($LASTEXITCODE -ne 0) {
    throw "No fue posible consultar la version actual."
}

npm version $tipo --no-git-tag-version
if ($LASTEXITCODE -ne 0) {
    throw "No fue posible incrementar la version."
}

$versionNueva = node -p "require('./package.json').version"
if ($LASTEXITCODE -ne 0) {
    throw "No fue posible consultar la nueva version."
}

Write-Host "Version actualizada: $versionAnterior -> $versionNueva" -ForegroundColor Green

# 7. Preparar y confirmar cambios
git add -A
if ($LASTEXITCODE -ne 0) {
    throw "No fue posible preparar los cambios."
}

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No hay cambios preparados para confirmar." -ForegroundColor Yellow
    exit 0
}

git commit -m "$mensaje (v$versionNueva)"
if ($LASTEXITCODE -ne 0) {
    throw "No se pudo crear el commit. Revisa el estado de Git."
}

# 8. Publicar en GitHub
git push
if ($LASTEXITCODE -ne 0) {
    throw "El commit existe localmente, pero git push fallo. Revisa el estado antes de reintentar."
}

Write-Host "`nPublicacion enviada correctamente a GitHub." -ForegroundColor Green
Write-Host "Render desplegara los cambios si el servicio esta configurado para ello." -ForegroundColor Green
