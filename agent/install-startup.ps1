param([switch]$Remove)

# Registers (or removes) a per-user scheduled task that starts the Soundly agent when you sign in.
$TaskName = 'SoundlyAgent'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$TaskName'."
    return
}

$python = (Get-Command python -ErrorAction Stop).Source
$pythonw = Join-Path (Split-Path $python) 'pythonw.exe'   # no console window
if (-not (Test-Path $pythonw)) { $pythonw = $python }
$agent = Join-Path $PSScriptRoot 'agent.py'

$action   = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$agent`"" -WorkingDirectory $PSScriptRoot
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Soundly laptop agent: downloads requested songs when on home Wi-Fi.' -Force | Out-Null
Write-Host "Registered '$TaskName'. It starts at your next sign-in. Start it now with: Start-ScheduledTask -TaskName $TaskName"
