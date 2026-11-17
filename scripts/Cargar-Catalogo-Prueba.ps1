param(
    [string]$BaseUrl = 'http://127.0.0.1:8080',
    [string]$Email = 'admin@kairos.local',
    [System.Security.SecureString]$Password
)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$root = Split-Path -Parent $PSScriptRoot
$catalog = Get-Content -LiteralPath (Join-Path $root 'data/catalogo-inicial.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Password) {
    $credential = Get-Credential -UserName $Email -Message 'Administrador de Kairos para cargar el catálogo de prueba'
    if (-not $credential) { throw 'Carga cancelada.' }
    $Email = $credential.UserName
    $Password = $credential.Password
}
$credential = [System.Management.Automation.PSCredential]::new($Email, $Password)
$prefix = Join-Path ([IO.Path]::GetTempPath()) ('kairos-import-' + [guid]::NewGuid().ToString('N'))
$cookiePath = $prefix + '.cookies'
$jsonPath = $prefix + '.json'
$responsePath = $prefix + '.response.json'
$utf8 = [Text.UTF8Encoding]::new($false)
$statePath = Join-Path $root '.kairos-import-state.json'
$state = @{base_url = $BaseUrl; employees = @{}; places = @{}; owner_id = $null}
if (Test-Path -LiteralPath $statePath) {
    $saved = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($saved.base_url -ne $BaseUrl) { throw 'Usar la misma BaseUrl que la carga anterior para conservar el seguimiento.' }
    foreach ($property in $saved.employees.PSObject.Properties) { $state.employees[$property.Name] = $property.Value }
    foreach ($property in $saved.places.PSObject.Properties) { $state.places[$property.Name] = $property.Value }
    $state.owner_id = $saved.owner_id
}
function Save-ImportState { [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 8), $utf8) }

function Invoke-Kairos([string]$Path, [string]$Method = 'GET', $Body = $null) {
    $arguments = @('--noproxy', '*', '--silent', '--show-error', '--fail-with-body', '--connect-timeout', '5', '--max-time', '30', '--request', $Method, '--header', 'X-Kairos-Client: web', '--cookie', $cookiePath, '--cookie-jar', $cookiePath)
    if ($null -ne $Body) {
        [IO.File]::WriteAllText($jsonPath, ($Body | ConvertTo-Json -Depth 12 -Compress), $utf8)
        $arguments += @('--header', 'Content-Type: application/json', '--data-binary', ('@' + $jsonPath))
    }
    try {
        & curl.exe @arguments --output $responsePath ($BaseUrl + '/api' + $Path)
        $curlExit = $LASTEXITCODE
        $response = if (Test-Path -LiteralPath $responsePath) { [IO.File]::ReadAllText($responsePath, $utf8) } else { '' }
        if ($curlExit -ne 0) {
            $message = 'Falló la solicitud a ' + $Path
            try { $message = ($response | ConvertFrom-Json).message } catch {}
            throw $message
        }
        return ($response | ConvertFrom-Json)
    } finally {
        if (Test-Path -LiteralPath $jsonPath) { Remove-Item -LiteralPath $jsonPath -Force }
        if (Test-Path -LiteralPath $responsePath) { Remove-Item -LiteralPath $responsePath -Force }
    }
}

try {
    $login = @{email = $Email; password = $credential.GetNetworkCredential().Password}
    try { $user = Invoke-Kairos '/login' 'POST' $login } finally { $login.Clear(); $credential = $null; $Password = $null }
    if ($user.role -ne 'admin') { throw 'La cuenta debe tener rol administrador.' }
    $existing = Invoke-Kairos '/catalog'
    $employeeRows = @()
    for ($i = 0; $i -lt $catalog.employees.Count; $i++) {
        $employee = $catalog.employees[$i]
        $dni = if ($employee.dni) { [string]$employee.dni } else { (999000000001L + $i).ToString() }
        $match = @($existing.employees | Where-Object { $_.dni -eq $dni })
        $tracked = @($existing.employees | Where-Object { $_.id -eq $state.employees[$employee.source_key] })
        if (-not $tracked.Count -and $match.Count -gt 0 -and $match[0].name -cne $employee.name) {
            throw "El DNI de prueba $dni ya corresponde a otro nombre. No se modificó ese empleado."
        }
        $employeeRows += @{source_key = $employee.source_key; name = $employee.name; dni = $dni; phone = ''; active = $true}
    }
    $ownerName = 'Due' + [char]0x00f1 + 'o de prueba - reemplazar'
    $owners = @($existing.owners | Where-Object { ($_.id -eq $state.owner_id -or $_.name -ceq $ownerName) -and $_.active })
    if ($owners.Count -gt 1) { throw 'Hay varios dueños de prueba con el mismo nombre. Revisalos antes de importar.' }
    $owner = if ($owners.Count -eq 1) { $owners[0] } else { Invoke-Kairos '/catalog/owners' 'POST' @{name = $ownerName; phone = ''; active = $true} }
    $state.owner_id = $owner.id
    Save-ImportState
    $createdEmployees = 0; $skippedEmployees = 0; $createdPlaces = 0; $skippedPlaces = 0
    foreach ($employee in $employeeRows) {
        $match = @($existing.employees | Where-Object { $_.id -eq $state.employees[$employee.source_key] -or $_.dni -eq $employee.dni })
        if ($match.Count -gt 0) { $state.employees[$employee.source_key] = $match[0].id; Save-ImportState; $skippedEmployees++; continue }
        $created = Invoke-Kairos '/catalog/employees' 'POST' $employee
        $state.employees[$employee.source_key] = $created.id
        Save-ImportState
        $createdEmployees++
    }
    foreach ($name in $catalog.places) {
        $match = @($existing.places | Where-Object { $_.id -eq $state.places[$name] -or $_.name -ceq $name })
        if ($match.Count -gt 0) { $state.places[$name] = $match[0].id; Save-ImportState; $skippedPlaces++; continue }
        $body = @{name = $name; address = ''; active = $true; owners = @(@{owner_id = $owner.id; is_primary = $true})}
        $created = Invoke-Kairos '/catalog/places' 'POST' $body
        $state.places[$name] = $created.id
        Save-ImportState
        $createdPlaces++
    }
    $verified = Invoke-Kairos '/catalog'
    foreach ($employee in $employeeRows) {
        if (@($verified.employees | Where-Object { $_.id -eq $state.employees[$employee.source_key] }).Count -ne 1) { throw "No se pudo verificar el empleado $($employee.source_key)." }
    }
    foreach ($name in $catalog.places) {
        if (@($verified.places | Where-Object { $_.id -eq $state.places[$name] }).Count -ne 1) { throw "No se pudo verificar el lugar $name." }
    }
    Write-Output "Carga verificada: $($employeeRows.Count) empleados y $($catalog.places.Count) lugares presentes."
    Write-Output "Creados: $createdEmployees empleados y $createdPlaces lugares. Ya existentes: $skippedEmployees empleados y $skippedPlaces lugares."
    Write-Output "DNI ficticios: 999000000001 a $($employeeRows[-1].dni). Dueño predeterminado: $ownerName."
} finally {
    if (Test-Path -LiteralPath $cookiePath) {
        try { $null = Invoke-Kairos '/logout' 'POST' @{} } catch {}
        Remove-Item -LiteralPath $cookiePath -Force
    }
    if (Test-Path -LiteralPath $jsonPath) { Remove-Item -LiteralPath $jsonPath -Force }
}
