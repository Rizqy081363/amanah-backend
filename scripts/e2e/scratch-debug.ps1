. "$PSScriptRoot\common.ps1"
$baseUrl = Get-E2EBaseUrl
$login = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = 'dokter@amanah.com'; password = 'secret123' } | ConvertTo-Json) -ContentType 'application/json'
$headers = @{ "Authorization" = "Bearer $($login.token)" }
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "DELETE FROM practitioner_schedule_sessions WHERE schedule_date = '2026-10-06';" | Out-Null
$body = @{ date = '2026-10-06'; scheduleContextId = 'morning'; startTime = '08:45'; notes = 'test' } | ConvertTo-Json
$res = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/availability" -Method Post -Body $body -ContentType 'application/json' -Headers $headers
Write-Host "endTime: $($res.schedule.endTime)"
Write-Host "capacity: $($res.schedule.capacity)"
Write-Host "remainingShiftSlots: $($res.projection.remainingShiftSlots)"
$db = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT start_time, end_time, capacity, status FROM practitioner_schedule_sessions WHERE id = '$($res.schedule.id)';"
Write-Host "DB: $db"
